const crypto = require("crypto");
const { promisify } = require("util");

const scrypt = promisify(crypto.scrypt);
const SESSION_DAYS = 30;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt:${salt.toString("hex")}:${Buffer.from(derived).toString("hex")}`;
}

async function verifyPassword(password, stored) {
  const parts = String(stored || "").split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  try {
    const salt = Buffer.from(parts[1], "hex");
    const expected = Buffer.from(parts[2], "hex");
    const actual = Buffer.from(await scrypt(password, salt, expected.length, { N: 16384, r: 8, p: 1 }));
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch (_) {
    return false;
  }
}

async function ensureAuthTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id BIGSERIAL PRIMARY KEY,
      email VARCHAR(254) NOT NULL UNIQUE,
      nome VARCHAR(120) NOT NULL,
      password_hash TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      role VARCHAR(20) NOT NULL DEFAULT 'user'
    )
  `);
  await pool.query(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user'`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_admin_audit (
      id BIGSERIAL PRIMARY KEY,
      actor_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
      action VARCHAR(80) NOT NULL,
      target_type VARCHAR(40),
      target_id VARCHAR(80),
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_app_admin_audit_created ON app_admin_audit(created_at DESC)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_sessions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      token_hash CHAR(64) NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_profile_link_requests (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      profile_type VARCHAR(20) NOT NULL CHECK (profile_type IN ('jogador','goleiro')),
      profile_id INTEGER NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      solicitado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      analisado_em TIMESTAMPTZ
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS app_profile_link_one_active
    ON app_profile_link_requests(profile_type, profile_id)
    WHERE status IN ('pending','approved')
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS app_profile_link_one_pending_per_user
    ON app_profile_link_requests(user_id)
    WHERE status = 'pending'
  `);
}

function createRequireAdmin(pool, authReady) {
  const ready = authReady;
  return async function requireAdmin(req, res, next) {
    try {
      await ready;
      const header = String(req.headers.authorization || "");
      const match = header.match(/^Bearer\s+([A-Za-z0-9_-]{40,})$/i);
      if (!match) return res.status(401).json({ error: "Autenticação necessária." });
      const tokenHash = hashToken(match[1]);
      const result = await pool.query(
        "SELECT u.id,u.email,u.nome,u.status,u.role FROM app_sessions s JOIN app_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW()",
        [tokenHash]
      );
      if (!result.rows.length || result.rows[0].status !== "active") {
        return res.status(401).json({ error: "Sessão inválida ou expirada." });
      }
      if (result.rows[0].role !== "admin") {
        return res.status(403).json({ error: "Esta conta não possui permissão de administrador." });
      }
      req.authUser = result.rows[0];
      req.authTokenHash = tokenHash;
      next();
    } catch (err) {
      console.error("Falha ao validar permissão administrativa:", err.message);
      res.status(503).json({ error: "Não foi possível validar a permissão administrativa." });
    }
  };
}

function registerAuthRoutes(app, pool) {
  const ready = ensureAuthTables(pool);

  async function authenticate(req, res, next) {
    try {
      await ready;
      const header = String(req.headers.authorization || "");
      const match = header.match(/^Bearer\s+([A-Za-z0-9_-]{40,})$/i);
      if (!match) return res.status(401).json({ error: "Autenticação necessária." });
      const result = await pool.query(`
        SELECT u.id,u.email,u.nome,u.status,u.role,s.id AS session_id
        FROM app_sessions s JOIN app_users u ON u.id=s.user_id
        WHERE s.token_hash=$1 AND s.expires_at>NOW()
      `, [hashToken(match[1])]);
      if (!result.rows.length || result.rows[0].status !== "active") {
        return res.status(401).json({ error: "Sessão inválida ou expirada." });
      }
      req.authUser = result.rows[0];
      req.authTokenHash = hashToken(match[1]);
      next();
    } catch (err) {
      console.error("Falha na autenticação FutPontos:", err.message);
      res.status(503).json({ error: "Serviço de autenticação indisponível." });
    }
  }

  app.post("/auth/register", async (req, res) => {
    try {
      await ready;
      const nome = String(req.body?.nome || "").trim();
      const email = normalizeEmail(req.body?.email);
      const password = String(req.body?.senha || "");
      const profileType = req.body?.tipo_perfil == null ? null : String(req.body.tipo_perfil);
      const profileId = req.body?.perfil_id == null ? null : Number(req.body.perfil_id);
      if (nome.length < 2 || nome.length > 120) return res.status(400).json({ error: "Informe um nome entre 2 e 120 caracteres." });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: "E-mail inválido." });
      if (password.length < 10 || password.length > 128) return res.status(400).json({ error: "A senha deve ter entre 10 e 128 caracteres." });
      if ((profileType === null) !== (profileId === null)) return res.status(400).json({ error: "Seleção de perfil incompleta." });
      if (profileType !== null && !["jogador","goleiro"].includes(profileType)) return res.status(400).json({ error: "Tipo de perfil inválido." });
      if (profileId !== null && (!Number.isSafeInteger(profileId) || profileId <= 0)) return res.status(400).json({ error: "Perfil selecionado inválido." });

      const passwordHash = await hashPassword(password);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const created = await client.query(
          "INSERT INTO app_users(email,nome,password_hash) VALUES($1,$2,$3) RETURNING id,email,nome,status,criado_em",
          [email, nome, passwordHash]
        );
        const user = created.rows[0];
        let link = null;
        if (profileType && profileId) {
          const table = profileType === "jogador" ? "jogadores" : "goleiros";
          const exists = await client.query(`SELECT id,nome FROM ${table} WHERE id=$1`, [profileId]);
          if (!exists.rows.length) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "O perfil esportivo selecionado não existe mais." });
          }
          const inserted = await client.query(
            "INSERT INTO app_profile_link_requests(user_id,profile_type,profile_id) VALUES($1,$2,$3) RETURNING id,status,profile_type,profile_id",
            [user.id, profileType, profileId]
          );
          link = inserted.rows[0];
        }
        await client.query("COMMIT");
        res.status(201).json({ success: true, user, vinculo: link, message: link ? "Cadastro criado. A vinculação do perfil aguarda aprovação." : "Cadastro criado sem vínculo esportivo." });
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        if (err.code === "23505") return res.status(409).json({ error: "Este e-mail já está cadastrado ou o perfil já possui uma solicitação de vínculo ativa." });
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("Erro no cadastro FutPontos:", err.message);
      res.status(500).json({ error: "Não foi possível concluir o cadastro." });
    }
  });

  app.post("/auth/login", async (req, res) => {
    try {
      await ready;
      const email = normalizeEmail(req.body?.email);
      const password = String(req.body?.senha || "");
      const found = await pool.query("SELECT id,email,nome,password_hash,status FROM app_users WHERE email=$1", [email]);
      if (!found.rows.length || found.rows[0].status !== "active" || !(await verifyPassword(password, found.rows[0].password_hash))) {
        return res.status(401).json({ error: "E-mail ou senha incorretos." });
      }
      const user = found.rows[0];
      const token = crypto.randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
      await pool.query("INSERT INTO app_sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3)", [user.id, hashToken(token), expiresAt]);
      res.json({ token, expires_at: expiresAt.toISOString(), user: { id: user.id, email: user.email, nome: user.nome } });
    } catch (err) {
      console.error("Erro no login FutPontos:", err.message);
      res.status(500).json({ error: "Não foi possível entrar." });
    }
  });

  app.get("/auth/me", authenticate, async (req, res) => {
    const links = await pool.query(
      "SELECT id,profile_type,profile_id,status,solicitado_em,analisado_em FROM app_profile_link_requests WHERE user_id=$1 ORDER BY solicitado_em DESC",
      [req.authUser.id]
    );
    res.json({ user: { id: req.authUser.id, email: req.authUser.email, nome: req.authUser.nome, role: req.authUser.role || 'user' }, vinculos: links.rows });
  });

  app.patch("/auth/profile", authenticate, async (req, res) => {
    try {
      await ready;
      const nome = req.body?.nome === undefined
        ? String(req.authUser.nome || "")
        : String(req.body.nome || "").trim();
      if (nome.length < 2 || nome.length > 120) {
        return res.status(400).json({ error: "O nome deve ter entre 2 e 120 caracteres." });
      }

      const wantsPassword = req.body?.senha_atual !== undefined || req.body?.nova_senha !== undefined;
      let passwordHash = null;
      if (wantsPassword) {
        const currentPassword = String(req.body?.senha_atual || "");
        const newPassword = String(req.body?.nova_senha || "");
        if (!currentPassword || newPassword.length < 10 || newPassword.length > 128) {
          return res.status(400).json({ error: "Informe a senha atual e uma nova senha entre 10 e 128 caracteres." });
        }
        const current = await pool.query("SELECT password_hash FROM app_users WHERE id=$1", [req.authUser.id]);
        if (!current.rows.length || !(await verifyPassword(currentPassword, current.rows[0].password_hash))) {
          return res.status(401).json({ error: "A senha atual está incorreta." });
        }
        passwordHash = await hashPassword(newPassword);
      }

      const updated = passwordHash
        ? await pool.query(
            "UPDATE app_users SET nome=$1,password_hash=$2 WHERE id=$3 RETURNING id,email,nome,status,criado_em",
            [nome, passwordHash, req.authUser.id]
          )
        : await pool.query(
            "UPDATE app_users SET nome=$1 WHERE id=$2 RETURNING id,email,nome,status,criado_em",
            [nome, req.authUser.id]
          );

      if (passwordHash) {
        await pool.query(
          "DELETE FROM app_sessions WHERE user_id=$1 AND token_hash<>$2",
          [req.authUser.id, req.authTokenHash]
        );
      }
      res.json({ success: true, user: updated.rows[0] });
    } catch (err) {
      console.error("Erro ao atualizar conta FutPontos:", err.message);
      res.status(500).json({ error: "Não foi possível atualizar a conta." });
    }
  });

  async function requireAdmin(req, res, next) {
    try {
      await ready;
      const header = String(req.headers.authorization || "");
      const match = header.match(/^Bearer\s+([A-Za-z0-9_-]{40,})$/i);
      if (!match) return res.status(401).json({ error: "Autenticação necessária." });
      const found = await pool.query(
        "SELECT u.id,u.email,u.nome,u.status,u.role,s.id AS session_id FROM app_sessions s JOIN app_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW()",
        [hashToken(match[1])]
      );
      if (!found.rows.length || found.rows[0].status !== "active") {
        return res.status(401).json({ error: "Sessão inválida ou expirada." });
      }
      if (found.rows[0].role !== "admin") return res.status(403).json({ error: "Esta conta não possui permissão de administrador." });
      req.authUser = found.rows[0];
      req.authTokenHash = hashToken(match[1]);
      next();
    } catch (err) {
      console.error("Falha ao validar administrador FutPontos:", err.message);
      res.status(503).json({ error: "Não foi possível validar a permissão administrativa." });
    }
  }

  async function auditAdmin(actorId, action, targetType, targetId, details = {}) {
    await pool.query(
      "INSERT INTO app_admin_audit(actor_user_id,action,target_type,target_id,details) VALUES($1,$2,$3,$4,$5::jsonb)",
      [actorId, action, targetType, String(targetId ?? ""), JSON.stringify(details)]
    );
  }

  app.get("/admin/overview", requireAdmin, async (req, res) => {
    try {
      const [counts, current, admins] = await Promise.all([
        pool.query(`SELECT
          (SELECT COUNT(*)::int FROM app_users) AS usuarios,
          (SELECT COUNT(*)::int FROM app_users WHERE status='active') AS usuarios_ativos,
          (SELECT COUNT(*)::int FROM jogadores) AS jogadores,
          (SELECT COUNT(*)::int FROM goleiros) AS goleiros,
          (SELECT COUNT(*)::int FROM app_profile_link_requests WHERE status='pending') AS vinculos_pendentes,
          (SELECT COUNT(*)::int FROM app_sessions WHERE expires_at>NOW()) AS sessoes_ativas`),
        pool.query("SELECT chave,nome,status FROM competencias WHERE status='aberta' ORDER BY id DESC LIMIT 1"),
        pool.query("SELECT COUNT(*)::int AS total FROM app_users WHERE role='admin' AND status='active'")
      ]);
      res.json({ success: true, resumo: counts.rows[0], competencia: current.rows[0] || null,
        administradores_ativos: admins.rows[0].total,
        administrador_atual: { id: req.authUser.id, nome: req.authUser.nome, email: req.authUser.email } });
    } catch (err) {
      console.error("Erro no resumo administrativo:", err.message);
      res.status(500).json({ error: "Não foi possível carregar o resumo administrativo." });
    }
  });

  app.get("/admin/users", requireAdmin, async (_req, res) => {
    try {
      const result = await pool.query(`
        SELECT u.id,u.nome,u.email,u.status,u.role,u.criado_em,
          l.id AS link_id,l.profile_type,l.profile_id,l.status AS link_status
        FROM app_users u
        LEFT JOIN LATERAL (
          SELECT id,profile_type,profile_id,status FROM app_profile_link_requests
          WHERE user_id=u.id ORDER BY solicitado_em DESC,id DESC LIMIT 1
        ) l ON TRUE
        ORDER BY u.criado_em DESC,u.id DESC LIMIT 500
      `);
      res.json({ success: true, usuarios: result.rows });
    } catch (err) {
      console.error("Erro ao listar usuários administrativos:", err.message);
      res.status(500).json({ error: "Não foi possível listar os usuários." });
    }
  });

  app.get("/admin/links", requireAdmin, async (_req, res) => {
    try {
      const result = await pool.query(`
        SELECT l.id,l.user_id,l.profile_type,l.profile_id,l.status,l.solicitado_em,
          u.nome AS usuario_nome,u.email,
          CASE WHEN l.profile_type='jogador' THEN j.nome ELSE g.nome END AS perfil_nome
        FROM app_profile_link_requests l
        JOIN app_users u ON u.id=l.user_id
        LEFT JOIN jogadores j ON l.profile_type='jogador' AND j.id=l.profile_id
        LEFT JOIN goleiros g ON l.profile_type='goleiro' AND g.id=l.profile_id
        WHERE l.status='pending'
        ORDER BY l.solicitado_em ASC
      `);
      res.json({ success: true, vinculos: result.rows });
    } catch (err) {
      console.error("Erro ao listar vínculos pendentes:", err.message);
      res.status(500).json({ error: "Não foi possível listar os vínculos pendentes." });
    }
  });

  app.patch("/admin/links/:id", requireAdmin, async (req, res) => {
    const status = String(req.body?.status || "");
    if (!["approved", "rejected"].includes(status)) return res.status(400).json({ error: "Decisão inválida." });
    try {
      const result = await pool.query(
        "UPDATE app_profile_link_requests SET status=$1,analisado_em=NOW() WHERE id=$2 AND status='pending' RETURNING id,user_id,profile_type,profile_id,status",
        [status, req.params.id]
      );
      if (!result.rows.length) return res.status(404).json({ error: "Solicitação pendente não encontrada." });
      await auditAdmin(req.authUser.id, "profile_link." + status, "profile_link", result.rows[0].id,
        { user_id: result.rows[0].user_id, profile_type: result.rows[0].profile_type, profile_id: result.rows[0].profile_id });
      res.json({ success: true, vinculo: result.rows[0] });
    } catch (err) {
      if (err.code === "23505") return res.status(409).json({ error: "Este perfil já possui outro vínculo ativo ou pendente." });
      console.error("Erro ao decidir vínculo:", err.message);
      res.status(500).json({ error: "Não foi possível atualizar o vínculo." });
    }
  });

  app.patch("/admin/users/:id/role", requireAdmin, async (req, res) => {
    const role = String(req.body?.role || "");
    if (!["admin", "user"].includes(role)) return res.status(400).json({ error: "Papel inválido." });
    if (String(req.params.id) === String(req.authUser.id)) return res.status(400).json({ error: "Não é permitido alterar o próprio papel." });
    try {
      if (role === "user") {
        const admins = await pool.query("SELECT COUNT(*)::int AS total FROM app_users WHERE role='admin' AND status='active' AND id<>$1", [req.params.id]);
        const target = await pool.query("SELECT role FROM app_users WHERE id=$1", [req.params.id]);
        if (!target.rows.length) return res.status(404).json({ error: "Usuário não encontrado." });
        if (target.rows[0].role === "admin" && admins.rows[0].total === 0) {
          return res.status(409).json({ error: "Não é possível remover o último administrador ativo." });
        }
      }
      const result = await pool.query("UPDATE app_users SET role=$1 WHERE id=$2 RETURNING id,nome,email,status,role", [role, req.params.id]);
      if (!result.rows.length) return res.status(404).json({ error: "Usuário não encontrado." });
      await auditAdmin(req.authUser.id, "user.role_changed", "user", req.params.id, { role });
      res.json({ success: true, usuario: result.rows[0] });
    } catch (err) {
      console.error("Erro ao alterar papel:", err.message);
      res.status(500).json({ error: "Não foi possível alterar o papel do usuário." });
    }
  });

  app.patch("/admin/users/:id/status", requireAdmin, async (req, res) => {
    const status = String(req.body?.status || "");
    if (!["active", "blocked"].includes(status)) return res.status(400).json({ error: "Situação inválida." });
    if (String(req.params.id) === String(req.authUser.id)) return res.status(400).json({ error: "Não é permitido bloquear a própria conta." });
    try {
      const result = await pool.query("UPDATE app_users SET status=$1 WHERE id=$2 RETURNING id,nome,email,status,role", [status, req.params.id]);
      if (!result.rows.length) return res.status(404).json({ error: "Usuário não encontrado." });
      if (status === "blocked") await pool.query("DELETE FROM app_sessions WHERE user_id=$1", [req.params.id]);
      await auditAdmin(req.authUser.id, "user.status_changed", "user", req.params.id, { status });
      res.json({ success: true, usuario: result.rows[0] });
    } catch (err) {
      console.error("Erro ao alterar situação da conta:", err.message);
      res.status(500).json({ error: "Não foi possível alterar a situação da conta." });
    }
  });

  app.get("/admin/audit", requireAdmin, async (_req, res) => {
    try {
      const result = await pool.query(`
        SELECT a.id,a.action,a.target_type,a.target_id,a.details,a.created_at,
          u.nome AS administrador_nome,u.email AS administrador_email
        FROM app_admin_audit a LEFT JOIN app_users u ON u.id=a.actor_user_id
        ORDER BY a.created_at DESC,a.id DESC LIMIT 200
      `);
      res.json({ success: true, registros: result.rows });
    } catch (err) {
      console.error("Erro ao carregar auditoria:", err.message);
      res.status(500).json({ error: "Não foi possível carregar o registro administrativo." });
    }
  });

  app.post("/auth/logout", authenticate, async (req, res) => {
    await pool.query("DELETE FROM app_sessions WHERE token_hash=$1", [req.authTokenHash]);
    res.json({ success: true });
  });

  return ready;
}

module.exports = { registerAuthRoutes, createRequireAdmin };

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
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
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

function registerAuthRoutes(app, pool) {
  const ready = ensureAuthTables(pool);

  async function authenticate(req, res, next) {
    try {
      await ready;
      const header = String(req.headers.authorization || "");
      const match = header.match(/^Bearer\s+([A-Za-z0-9_-]{40,})$/i);
      if (!match) return res.status(401).json({ error: "Autenticação necessária." });
      const result = await pool.query(`
        SELECT u.id,u.email,u.nome,u.status,s.id AS session_id
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
    res.json({ user: { id: req.authUser.id, email: req.authUser.email, nome: req.authUser.nome }, vinculos: links.rows });
  });

  app.post("/auth/logout", authenticate, async (req, res) => {
    await pool.query("DELETE FROM app_sessions WHERE token_hash=$1", [req.authTokenHash]);
    res.json({ success: true });
  });

  return ready;
}

module.exports = { registerAuthRoutes };

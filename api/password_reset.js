const crypto = require("crypto");

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function hashCode(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function safeEqualHex(left, right) {
  const a = Buffer.from(String(left || ""), "hex");
  const b = Buffer.from(String(right || ""), "hex");
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

async function sendResetCode(email, code) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY e RESEND_FROM precisam estar configurados.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Código para redefinir sua senha — FutPontos",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#172033">
          <h2>Redefinição de senha</h2>
          <p>Use o código abaixo no aplicativo FutPontos para criar uma nova senha.</p>
          <p style="font-size:30px;font-weight:700;letter-spacing:8px;padding:16px;background:#f1f4f8;text-align:center">${code}</p>
          <p>O código expira em 15 minutos e só pode ser usado uma vez.</p>
          <p>Se você não solicitou esta alteração, ignore esta mensagem. Sua senha atual continuará válida.</p>
        </div>
      `
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Falha no envio de e-mail pelo Resend: HTTP ${response.status} ${detail.slice(0, 300)}`);
  }
}

function registerPasswordResetRoutes(app, pool, ready, hashPassword) {
  app.post("/auth/password-reset/request", async (req, res) => {
    try {
      await ready;
      const email = normalizeEmail(req.body?.email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        return res.status(400).json({ error: "Informe um e-mail válido." });
      }

      const userResult = await pool.query(
        "SELECT id,email FROM app_users WHERE email=$1 AND status='active' LIMIT 1",
        [email]
      );

      // Resposta idêntica para e-mails existentes e inexistentes.
      if (!userResult.rows.length) {
        return res.status(202).json({
          success: true,
          message: "Se houver uma conta ativa com esse e-mail, enviaremos um código de recuperação."
        });
      }

      const recent = await pool.query(
        "SELECT id FROM app_password_resets WHERE email=$1 AND solicitado_em > NOW() - INTERVAL '60 seconds' ORDER BY solicitado_em DESC LIMIT 1",
        [email]
      );
      if (recent.rows.length) {
        return res.status(202).json({
          success: true,
          message: "Se houver uma conta ativa com esse e-mail, enviaremos um código de recuperação. Aguarde 60 segundos antes de solicitar outro."
        });
      }

      const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
      const codeHash = hashCode(code);
      await pool.query(
        "INSERT INTO app_password_resets(user_id,email,code_hash,expires_at) VALUES($1,$2,$3,NOW() + INTERVAL '15 minutes')",
        [userResult.rows[0].id, email, codeHash]
      );

      try {
        await sendResetCode(email, code);
      } catch (mailError) {
        await pool.query(
          "UPDATE app_password_resets SET consumed_at=NOW() WHERE email=$1 AND code_hash=$2 AND consumed_at IS NULL",
          [email, codeHash]
        );
        console.error("Falha ao enviar código de recuperação FutPontos:", mailError.message);
      }

      return res.status(202).json({
        success: true,
        message: "Se houver uma conta ativa com esse e-mail, enviaremos um código de recuperação."
      });
    } catch (err) {
      console.error("Erro ao solicitar recuperação de senha:", err.message);
      return res.status(503).json({ error: "Serviço de recuperação temporariamente indisponível." });
    }
  });

  app.post("/auth/password-reset/confirm", async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.codigo || "").trim();
    const newPassword = String(req.body?.nova_senha || "");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({ error: "Informe um e-mail válido." });
    }
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: "O código deve conter 6 números." });
    }
    if (newPassword.length < 10 || newPassword.length > 128) {
      return res.status(400).json({ error: "A nova senha deve ter entre 10 e 128 caracteres." });
    }

    const client = await pool.connect();
    try {
      await ready;
      await client.query("BEGIN");
      const found = await client.query(
        `SELECT r.id,r.user_id,r.code_hash,r.attempts,u.status
         FROM app_password_resets r
         JOIN app_users u ON u.id=r.user_id
         WHERE r.email=$1 AND r.consumed_at IS NULL AND r.expires_at>NOW()
         ORDER BY r.solicitado_em DESC
         LIMIT 1 FOR UPDATE OF r`,
        [email]
      );

      if (!found.rows.length || found.rows[0].status !== "active") {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Código inválido ou expirado. Solicite um novo código." });
      }

      const reset = found.rows[0];
      if (Number(reset.attempts) >= 5) {
        await client.query("UPDATE app_password_resets SET consumed_at=NOW() WHERE id=$1", [reset.id]);
        await client.query("COMMIT");
        return res.status(429).json({ error: "Limite de tentativas atingido. Solicite um novo código." });
      }

      if (!safeEqualHex(hashCode(code), reset.code_hash)) {
        await client.query("UPDATE app_password_resets SET attempts=attempts+1 WHERE id=$1", [reset.id]);
        await client.query("COMMIT");
        return res.status(400).json({ error: "Código inválido ou expirado. Confira os números ou solicite outro código." });
      }

      const passwordHash = await hashPassword(newPassword);
      await client.query(
        "UPDATE app_users SET password_hash=$1 WHERE id=$2",
        [passwordHash, reset.user_id]
      );
      await client.query(
        "UPDATE app_password_resets SET consumed_at=NOW() WHERE user_id=$1 AND consumed_at IS NULL",
        [reset.user_id]
      );
      await client.query("DELETE FROM app_sessions WHERE user_id=$1", [reset.user_id]);
      await client.query(
        "INSERT INTO app_admin_audit(actor_user_id,action,target_type,target_id,details) VALUES($1,'password.reset.completed','user',$1::text,$2::jsonb)",
        [reset.user_id, JSON.stringify({ source: "email_code" })]
      );
      await client.query("COMMIT");

      return res.json({
        success: true,
        message: "Senha redefinida. Entre novamente usando a nova senha."
      });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Erro ao confirmar redefinição de senha:", err.message);
      return res.status(500).json({ error: "Não foi possível redefinir a senha." });
    } finally {
      client.release();
    }
  });
}

module.exports = { registerPasswordResetRoutes };

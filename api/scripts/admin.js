require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const [,, command, rawEmail] = process.argv;
const email = String(rawEmail || "").trim().toLowerCase();

async function main() {
  await pool.query("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user'");
  await pool.query(\`
    CREATE TABLE IF NOT EXISTS app_admin_audit (
      id BIGSERIAL PRIMARY KEY,
      actor_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
      action VARCHAR(80) NOT NULL,
      target_type VARCHAR(40),
      target_id VARCHAR(80),
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  \`);

  if (command === "listar") {
    const result = await pool.query("SELECT email,nome,status,role FROM app_users WHERE role='admin' ORDER BY id");
    if (!result.rows.length) console.log("Nenhum administrador cadastrado.");
    for (const row of result.rows) console.log(\`\${row.email} · \${row.nome} · \${row.status}\`);
    return;
  }

  if (!["promover", "rebaixar"].includes(command) || !email) {
    throw new Error("Uso: node scripts/admin.js <listar|promover|rebaixar> [email]");
  }

  const found = await pool.query("SELECT id,email,nome,role FROM app_users WHERE email=$1", [email]);
  if (!found.rows.length) throw new Error("Conta não encontrada. Cadastre-a primeiro pelo aplicativo.");
  const account = found.rows[0];
  const role = command === "promover" ? "admin" : "user";

  if (role === "user" && account.role === "admin") {
    const admins = await pool.query("SELECT COUNT(*)::int AS total FROM app_users WHERE role='admin' AND status='active' AND id<>$1", [account.id]);
    if (admins.rows[0].total === 0) throw new Error("Não é possível rebaixar o último administrador ativo.");
  }

  await pool.query("UPDATE app_users SET role=$1 WHERE id=$2", [role, account.id]);
  await pool.query(
    "INSERT INTO app_admin_audit(actor_user_id,action,target_type,target_id,details) VALUES(NULL,$1,'user',$2,$3::jsonb)",
    [\`user.role_\${role}\`, String(account.id), JSON.stringify({ email, via: "console" })]
  );
  console.log(\`\${email} agora tem papel: \${role}.\`);
}

main().catch((error) => {
  console.error("Erro:", error.message);
  process.exitCode = 1;
}).finally(() => pool.end());

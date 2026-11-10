require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const { Pool } = require("pg");

const app = express();

app.use(cors());
app.use(express.json());
app.set("trust proxy", 1);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const PORT = process.env.PORT || 3000;
const DEFAULT_PARTIDA = "atual";
const MAX_TIMES = 5;
const MAX_JOGADORES_TIME = 7;
const UPLOAD_ROOT = path.join(__dirname, "public", "uploads");
const PLAYER_PHOTO_ROOT = path.join(UPLOAD_ROOT, "jogadores");
const GOALKEEPER_PHOTO_ROOT = path.join(UPLOAD_ROOT, "goleiros");
const MAX_PHOTO_SIZE = 5 * 1024 * 1024;

fs.mkdirSync(PLAYER_PHOTO_ROOT, { recursive: true });
fs.mkdirSync(GOALKEEPER_PHOTO_ROOT, { recursive: true });

const photoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PLAYER_PHOTO_ROOT),
  filename: (req, file, cb) => {
    const mime = String(file.mimetype || "").split(";", 1)[0].trim().toLowerCase();
    const extensionByMime = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/gif": ".gif",
      "application/octet-stream": ".jpg"
    };
    const extension = extensionByMime[mime] || (mime.startsWith("image/") ? ".jpg" : ".jpg");
    const jogadorId = String(req.params.id).replace(/[^0-9]/g, "") || "jogador";
    const suffix = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
    cb(null, `${jogadorId}-${suffix}${extension}`);
  }
});

const uploadPlayerPhoto = multer({
  storage: photoStorage,
  limits: { fileSize: MAX_PHOTO_SIZE },
  fileFilter: (_req, file, cb) => {
    // O Telegram/n8n pode entregar o arquivo com MIME ausente, parametrizado ou octet-stream.
    const mime = String(file.mimetype || "").split(";", 1)[0].trim().toLowerCase();
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/octet-stream", ""];
    if (!allowed.includes(mime) && !mime.startsWith("image/")) {
      return cb(new Error("Formato de imagem não permitido. Use JPG, PNG, WEBP ou GIF."));
    }
    cb(null, true);
  }
});

const goalkeeperPhotoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, GOALKEEPER_PHOTO_ROOT),
  filename: (req, file, cb) => {
    const mime = String(file.mimetype || "").split(";", 1)[0].trim().toLowerCase();
    const extension = {
      "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"
    }[mime] || ".jpg";
    const goleiroId = String(req.params.id).replace(/[^0-9]/g, "") || "goleiro";
    const suffix = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
    cb(null, `${goleiroId}-${suffix}${extension}`);
  }
});

const uploadGoalkeeperPhoto = multer({
  storage: goalkeeperPhotoStorage,
  limits: { fileSize: MAX_PHOTO_SIZE },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || "").split(";", 1)[0].trim().toLowerCase();
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/octet-stream", ""];
    if (!allowed.includes(mime) && !mime.startsWith("image/")) {
      return cb(new Error("Formato de imagem não permitido. Use JPG, PNG, WEBP ou GIF."));
    }
    cb(null, true);
  }
});

function calculatePoints(vitorias = 0, empate = 0, defesa = 0, gols = 0, infracoes = 0) {
  return (Number(vitorias) * 3) + (Number(empate) * 1) + (Number(defesa) * 1) + (Number(gols) * 2) - (Number(infracoes) * 2);
}

function normalizePlayer(data = {}) {
  const jogador = {
    nome: data.nome?.trim() || "Sem nome",
    foto: data.foto || null,
    vitorias: Number(data.vitorias) || 0,
    empate: Number(data.empate) || 0,
    defesa: Number(data.defesa) || 0,
    gols: Number(data.gols) || 0,
    infracoes: Number(data.infracoes) || 0
  };
  jogador.pontos = calculatePoints(jogador.vitorias, jogador.empate, jogador.defesa, jogador.gols, jogador.infracoes);
  return jogador;
}

function partidaId(req) {
  const valor = String(req.query.partida || req.body?.partida || DEFAULT_PARTIDA).trim();
  return valor.slice(0, 80) || DEFAULT_PARTIDA;
}

async function ensureMontagemTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS montagem_times (
      id BIGSERIAL PRIMARY KEY,
      partida VARCHAR(80) NOT NULL DEFAULT 'atual',
      jogador_id INTEGER NOT NULL REFERENCES jogadores(id) ON DELETE CASCADE,
      time_num INTEGER NOT NULL CHECK (time_num BETWEEN 1 AND 5),
      ordem INTEGER NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (partida, jogador_id),
      UNIQUE (partida, ordem)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_montagem_times_partida ON montagem_times (partida, time_num, ordem)`);
}


async function ensureCompetenciaTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS competencias (
      id BIGSERIAL PRIMARY KEY,
      chave VARCHAR(7) NOT NULL UNIQUE,
      nome VARCHAR(80) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','fechada')),
      aberta_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      fechada_em TIMESTAMPTZ
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS desempenho_mensal (
      id BIGSERIAL PRIMARY KEY,
      competencia_id BIGINT NOT NULL REFERENCES competencias(id) ON DELETE CASCADE,
      jogador_id INTEGER NOT NULL REFERENCES jogadores(id) ON DELETE CASCADE,
      pontos INTEGER NOT NULL DEFAULT 0,
      gols INTEGER NOT NULL DEFAULT 0,
      defesa INTEGER NOT NULL DEFAULT 0,
      vitorias INTEGER NOT NULL DEFAULT 0,
      empate INTEGER NOT NULL DEFAULT 0,
      infracoes INTEGER NOT NULL DEFAULT 0,
      ataque INTEGER,
      velocidade INTEGER,
      habilidade INTEGER,
      passe INTEGER,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (competencia_id, jogador_id)
    )
  `);
  const chave = new Date().toISOString().slice(0, 7);
  await pool.query(`INSERT INTO competencias (chave, nome) VALUES ($1, $2) ON CONFLICT (chave) DO NOTHING`, [chave, `Competência ${chave}`]);
  const competencia = await pool.query(`SELECT id FROM competencias WHERE chave=$1`, [chave]);
  const competenciaId = competencia.rows[0].id;
  await pool.query(`
    INSERT INTO desempenho_mensal (competencia_id,jogador_id,pontos,gols,defesa,vitorias,empate,infracoes)
    SELECT $1,j.id,COALESCE(j.pontos,0),COALESCE(j.gols,0),COALESCE(j.defesa,0),COALESCE(j.vitorias,0),COALESCE(j.empate,0),COALESCE(j.infracoes,0)
    FROM jogadores j
    ON CONFLICT (competencia_id,jogador_id) DO NOTHING
  `, [competenciaId]);
}

async function currentCompetencia(client = pool) {
  const result = await client.query(`SELECT * FROM competencias WHERE status='aberta' ORDER BY id DESC LIMIT 1`);
  if (!result.rows.length) throw new Error('Nenhuma competência mensal aberta');
  return result.rows[0];
}

function nextCompetencia(chave) {
  const [ano, mes] = String(chave).split('-').map(Number);
  const date = new Date(Date.UTC(ano, mes, 1));
  return date.toISOString().slice(0, 7);
}

async function ensurePartidaOperacoesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS partida_operacoes (
      id BIGSERIAL PRIMARY KEY,
      operacao_id VARCHAR(255) NOT NULL UNIQUE,
      jogadores_afetados JSONB,
      processada_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_partida_operacoes_id ON partida_operacoes (operacao_id)`);
}

async function ensureGoalkeeperTables() {
  // Garante a tabela-base antes de criar as tabelas de desempenho e histórico.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS goleiros (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      pontos INTEGER NOT NULL DEFAULT 0,
      vitorias INTEGER NOT NULL DEFAULT 0,
      empate INTEGER NOT NULL DEFAULT 0,
      defesa INTEGER NOT NULL DEFAULT 0,
      gols INTEGER NOT NULL DEFAULT 0,
      infracoes INTEGER NOT NULL DEFAULT 0,
      foto TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE goleiros ADD COLUMN IF NOT EXISTS nome VARCHAR(255) NOT NULL DEFAULT 'Sem nome'`);
  await pool.query(`ALTER TABLE goleiros ADD COLUMN IF NOT EXISTS pontos INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE goleiros ADD COLUMN IF NOT EXISTS vitorias INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE goleiros ADD COLUMN IF NOT EXISTS empate INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE goleiros ADD COLUMN IF NOT EXISTS defesa INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE goleiros ADD COLUMN IF NOT EXISTS gols INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE goleiros ADD COLUMN IF NOT EXISTS infracoes INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE goleiros ADD COLUMN IF NOT EXISTS foto TEXT`);
  await pool.query(`ALTER TABLE goleiros ADD COLUMN IF NOT EXISTS criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS desempenho_mensal_goleiros (
      id BIGSERIAL PRIMARY KEY,
      competencia_id BIGINT NOT NULL REFERENCES competencias(id) ON DELETE CASCADE,
      goleiro_id INTEGER NOT NULL REFERENCES goleiros(id) ON DELETE CASCADE,
      pontos INTEGER NOT NULL DEFAULT 0,
      jogos_disputados INTEGER NOT NULL DEFAULT 0,
      vitorias INTEGER NOT NULL DEFAULT 0,
      empates INTEGER NOT NULL DEFAULT 0,
      derrotas INTEGER NOT NULL DEFAULT 0,
      defesas INTEGER NOT NULL DEFAULT 0,
      gols INTEGER NOT NULL DEFAULT 0,
      gols_sofridos INTEGER NOT NULL DEFAULT 0,
      infracoes INTEGER NOT NULL DEFAULT 0,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (competencia_id, goleiro_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS partidas_goleiros (
      id BIGSERIAL PRIMARY KEY,
      operacao_id VARCHAR(255) NOT NULL,
      competencia_id BIGINT NOT NULL REFERENCES competencias(id) ON DELETE CASCADE,
      goleiro_id INTEGER NOT NULL REFERENCES goleiros(id) ON DELETE CASCADE,
      resultado VARCHAR(10) NOT NULL CHECK (resultado IN ('vitoria','empate','derrota')),
      defesas INTEGER NOT NULL DEFAULT 0,
      gols INTEGER NOT NULL DEFAULT 0,
      gols_sofridos INTEGER NOT NULL DEFAULT 0,
      infracoes INTEGER NOT NULL DEFAULT 0,
      pontos INTEGER NOT NULL DEFAULT 0,
      registrada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (operacao_id, goleiro_id)
    )
  `);
  await pool.query(`ALTER TABLE desempenho_mensal_goleiros ADD COLUMN IF NOT EXISTS gols INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE partidas_goleiros ADD COLUMN IF NOT EXISTS gols INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_desempenho_goleiros_competencia ON desempenho_mensal_goleiros (competencia_id, pontos DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_partidas_goleiros_goleiro ON partidas_goleiros (goleiro_id, registrada_em DESC)`);
  const competencia = await currentCompetencia();
  await pool.query(`
    INSERT INTO desempenho_mensal_goleiros (competencia_id, goleiro_id, pontos, vitorias, empates, defesas, gols, infracoes)
    SELECT $1, g.id, COALESCE(g.pontos,0), COALESCE(g.vitorias,0), COALESCE(g.empate,0), COALESCE(g.defesa,0), COALESCE(g.gols,0), COALESCE(g.infracoes,0) FROM goleiros g
    ON CONFLICT (competencia_id, goleiro_id) DO NOTHING
  `, [competencia.id]);
}

const monthlyReady = ensureCompetenciaTable();
const goalkeeperReady = monthlyReady.then(() => ensureGoalkeeperTables());

app.get("/", (req, res) => res.json({ status: "online", message: "API FutPontos ONLINE" }));

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", api: "online", database: "online" });
  } catch (err) {
    console.error("Health check DB:", err.message);
    res.status(503).json({ status: "degraded", api: "online", database: "offline" });
  }
});

app.get("/manifest.json", (req, res) => res.sendFile(path.join(__dirname, "public", "manifest.json")));
app.get("/sw.js", (req, res) => {
  res.setHeader("Service-Worker-Allowed", "/");
  res.setHeader("Content-Type", "application/javascript");
  res.sendFile(path.join(__dirname, "public", "sw.js"));
});

app.use("/uploads", express.static(UPLOAD_ROOT, {
  fallthrough: false,
  maxAge: "7d"
}));

app.get("/jogadores", async (req, res) => {
  try {
    await monthlyReady;
    const competencia = await currentCompetencia();
    const result = await pool.query(`SELECT j.id,j.nome,j.foto,j.criado_em,dm.pontos,dm.vitorias,dm.gols,dm.defesa,dm.empate,dm.infracoes, $1::text AS competencia FROM jogadores j JOIN desempenho_mensal dm ON dm.jogador_id=j.id AND dm.competencia_id=$2 ORDER BY dm.pontos DESC, dm.vitorias DESC, dm.gols DESC`, [competencia.chave, competencia.id]);
    res.json(result.rows);
  } catch (err) { console.error("Erro ao buscar jogadores:", err); res.status(500).json({ error: "Erro ao buscar jogadores" }); }
});

app.get("/jogadores/:id", async (req, res) => {
  try {
    await monthlyReady;
    const competencia = await currentCompetencia();
    const result = await pool.query(`SELECT j.id,j.nome,j.foto,j.criado_em,dm.pontos,dm.vitorias,dm.gols,dm.defesa,dm.empate,dm.infracoes,$1::text AS competencia FROM jogadores j JOIN desempenho_mensal dm ON dm.jogador_id=j.id AND dm.competencia_id=$2 WHERE j.id=$3`, [competencia.chave, competencia.id, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: "Jogador não encontrado" });
    res.json(result.rows[0]);
  } catch (err) { console.error("Erro ao buscar jogador:", err); res.status(500).json({ error: "Erro ao buscar jogador" }); }
});

app.get("/competencias", async (_req, res) => {
  try {
    await goalkeeperReady;
    const result = await pool.query(`SELECT c.id,c.chave,c.nome,c.status,c.aberta_em,c.fechada_em,COUNT(DISTINCT dm.id)::int AS jogadores,COUNT(DISTINCT dg.id)::int AS goleiros FROM competencias c LEFT JOIN desempenho_mensal dm ON dm.competencia_id=c.id LEFT JOIN desempenho_mensal_goleiros dg ON dg.competencia_id=c.id GROUP BY c.id ORDER BY c.chave DESC`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: "Erro ao listar competências" }); }
});

app.get("/competencias/atual", async (_req, res) => {
  try {
    await goalkeeperReady;
    const competencia = await currentCompetencia();
    const total = await pool.query(`SELECT (SELECT COUNT(*)::int FROM desempenho_mensal WHERE competencia_id=$1) AS jogadores, COALESCE((SELECT SUM(pontos)::int FROM desempenho_mensal WHERE competencia_id=$1),0) AS pontos, (SELECT COUNT(*)::int FROM desempenho_mensal_goleiros WHERE competencia_id=$1) AS goleiros, COALESCE((SELECT SUM(pontos)::int FROM desempenho_mensal_goleiros WHERE competencia_id=$1),0) AS pontos_goleiros`, [competencia.id]);
    res.json({ ...competencia, resumo: total.rows[0] });
  } catch (err) { res.status(500).json({ error: "Erro ao buscar competência atual" }); }
});

app.get("/competencias/:id/jogadores", async (req, res) => {
  try {
    const result = await pool.query(`SELECT j.id,j.nome,j.foto,dm.pontos,dm.gols,dm.defesa,dm.vitorias,dm.empate,dm.infracoes,c.chave AS competencia FROM desempenho_mensal dm JOIN jogadores j ON j.id=dm.jogador_id JOIN competencias c ON c.id=dm.competencia_id WHERE c.id=$1 ORDER BY dm.pontos DESC,dm.vitorias DESC,dm.gols DESC`, [req.params.id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: "Erro ao consultar histórico mensal" }); }
});

app.get("/competencias/:id/goleiros", async (req, res) => {
  try {
    await goalkeeperReady;
    const result = await pool.query(`
      SELECT g.id,g.nome,g.foto,dm.pontos,dm.jogos_disputados,dm.vitorias,dm.empates,dm.derrotas,
        dm.defesas,dm.gols,dm.gols_sofridos,dm.infracoes,c.chave AS competencia,
        CASE WHEN dm.jogos_disputados=0 THEN 0 ELSE ROUND(dm.gols_sofridos::numeric / dm.jogos_disputados, 2) END AS media_gols_sofridos
      FROM desempenho_mensal_goleiros dm JOIN goleiros g ON g.id=dm.goleiro_id JOIN competencias c ON c.id=dm.competencia_id
      WHERE c.id=$1 ORDER BY dm.pontos DESC,dm.vitorias DESC,dm.gols DESC,dm.defesas DESC,g.nome ASC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) { console.error("Erro ao consultar histórico de goleiros:", err); res.status(500).json({ error: "Erro ao consultar histórico de goleiros" }); }
});

app.post("/competencias/fechar", async (req, res) => {
  if (req.body?.confirm !== true) return res.status(400).json({ error: "Confirmação obrigatória", required: "confirm=true" });
  const client = await pool.connect();
  try {
    await monthlyReady;
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('fechamento-competencia'))");
    const atual = await currentCompetencia(client);
    const ranking = await client.query(`SELECT j.id,j.nome,dm.pontos,dm.gols,dm.defesa,dm.vitorias,dm.empate,dm.infracoes FROM desempenho_mensal dm JOIN jogadores j ON j.id=dm.jogador_id WHERE dm.competencia_id=$1 ORDER BY dm.pontos DESC,dm.vitorias DESC,dm.gols DESC`, [atual.id]);
    await client.query(`UPDATE competencias SET status='fechada',fechada_em=NOW() WHERE id=$1`, [atual.id]);
    const chaveNova = nextCompetencia(atual.chave);
    const criada = await client.query(`INSERT INTO competencias (chave,nome,status) VALUES ($1,$2,'aberta') ON CONFLICT (chave) DO UPDATE SET status='aberta' RETURNING *`, [chaveNova, `Competência ${chaveNova}`]);
    const nova = criada.rows[0];
    await client.query(`INSERT INTO desempenho_mensal (competencia_id,jogador_id) SELECT $1,id FROM jogadores ON CONFLICT (competencia_id,jogador_id) DO NOTHING`, [nova.id]);
    await client.query(`INSERT INTO desempenho_mensal_goleiros (competencia_id,goleiro_id) SELECT $1,id FROM goleiros ON CONFLICT (competencia_id,goleiro_id) DO NOTHING`, [nova.id]);
    await client.query("COMMIT");
    res.status(201).json({ success: true, encerrada: atual, nova_competencia: nova, ranking_final: ranking.rows });
  } catch (err) { await client.query("ROLLBACK").catch(() => {}); console.error("Erro ao fechar competência:", err); res.status(500).json({ error: "Erro ao fechar competência", detalhes: err.message }); }
  finally { client.release(); }
});

app.post("/jogadores", async (req, res) => {
  const jogador = normalizePlayer(req.body);
  try {
    const result = await pool.query(`INSERT INTO jogadores (nome, pontos, vitorias, empate, defesa, gols, infracoes, foto) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [jogador.nome, jogador.pontos, jogador.vitorias, jogador.empate, jogador.defesa, jogador.gols, jogador.infracoes, jogador.foto]);
    await monthlyReady;
    const competencia = await currentCompetencia();
    await pool.query(`INSERT INTO desempenho_mensal (competencia_id,jogador_id,pontos,gols,defesa,vitorias,empate,infracoes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [competencia.id, result.rows[0].id, jogador.pontos, jogador.gols, jogador.defesa, jogador.vitorias, jogador.empate, jogador.infracoes]);
    res.status(201).json({ ...result.rows[0], competencia: competencia.chave });
  } catch (err) { console.error("Erro ao salvar jogador:", err); res.status(500).json({ error: "Erro ao salvar jogador" }); }
});

app.put("/jogadores/:id", async (req, res) => {
  const jogador = normalizePlayer(req.body);
  try {
    const result = await pool.query(`UPDATE jogadores SET nome=$1,foto=$2 WHERE id=$3 RETURNING *`, [jogador.nome, jogador.foto, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: "Jogador não encontrado" });
    await monthlyReady;
    const competencia = await currentCompetencia();
    await pool.query(`INSERT INTO desempenho_mensal (competencia_id,jogador_id,pontos,gols,defesa,vitorias,empate,infracoes,atualizado_em) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()) ON CONFLICT (competencia_id,jogador_id) DO UPDATE SET pontos=$3,gols=$4,defesa=$5,vitorias=$6,empate=$7,infracoes=$8,atualizado_em=NOW()`, [competencia.id, req.params.id, jogador.pontos, jogador.gols, jogador.defesa, jogador.vitorias, jogador.empate, jogador.infracoes]);
    res.json({ ...result.rows[0], pontos: jogador.pontos, gols: jogador.gols, defesa: jogador.defesa, vitorias: jogador.vitorias, empate: jogador.empate, infracoes: jogador.infracoes, competencia: competencia.chave });
  } catch (err) { console.error("Erro ao atualizar jogador:", err); res.status(500).json({ error: "Erro ao atualizar jogador" }); }
});

app.post("/jogadores/:id/foto", uploadPlayerPhoto.single("foto"), async (req, res) => {
  const jogadorId = Number(req.params.id);
  if (!Number.isInteger(jogadorId) || jogadorId <= 0) {
    if (req.file?.path) fs.rmSync(req.file.path, { force: true });
    return res.status(400).json({ success: false, error: "ID do jogador inválido" });
  }
  if (!req.file) {
    return res.status(400).json({ success: false, error: "Envie uma imagem no campo multipart 'foto'" });
  }

  try {
    const jogador = await pool.query("SELECT id, foto FROM jogadores WHERE id = $1", [jogadorId]);
    if (!jogador.rows.length) {
      fs.rmSync(req.file.path, { force: true });
      return res.status(404).json({ success: false, error: "Jogador não encontrado" });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const fotoUrl = `${baseUrl}/uploads/jogadores/${encodeURIComponent(req.file.filename)}`;
    const atualizada = await pool.query(
      "UPDATE jogadores SET foto = $1 WHERE id = $2 RETURNING id, nome, foto",
      [fotoUrl, jogadorId]
    );

    const fotoAnterior = jogador.rows[0].foto;
    if (fotoAnterior) {
      try {
        const caminhoAnterior = new URL(fotoAnterior, baseUrl).pathname;
        const prefixo = "/uploads/jogadores/";
        if (caminhoAnterior.startsWith(prefixo)) {
          const nomeAnterior = path.basename(caminhoAnterior);
          fs.rmSync(path.join(PLAYER_PHOTO_ROOT, nomeAnterior), { force: true });
        }
      } catch (cleanupError) {
        console.warn("Não foi possível remover a foto anterior:", cleanupError.message);
      }
    }

    return res.status(201).json({
      success: true,
      jogador_id: atualizada.rows[0].id,
      nome: atualizada.rows[0].nome,
      foto: atualizada.rows[0].foto
    });
  } catch (err) {
    fs.rmSync(req.file.path, { force: true });
    console.error("Erro ao atualizar foto do jogador:", err);
    return res.status(500).json({ success: false, error: "Erro ao salvar foto do jogador" });
  }
});

app.delete("/jogadores/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM jogadores WHERE id=$1 RETURNING *", [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: "Jogador não encontrado" });
    res.json({ success: true });
  } catch (err) { console.error("Erro ao excluir jogador:", err); res.status(500).json({ error: "Erro ao excluir jogador" }); }
});

app.get("/desempenho", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT j.id,j.nome,j.pontos,j.vitorias,j.empate,j.gols,j.defesa AS defesa_classificacao,j.infracoes,j.foto,
      a.defesa AS avaliacao_defesa,a.ataque AS avaliacao_ataque,a.velocidade AS avaliacao_velocidade,a.habilidade AS avaliacao_habilidade,a.passe AS avaliacao_passe
      FROM jogadores j LEFT JOIN avaliacao_jogadores a ON a.jogador_id=j.id
      WHERE j.id NOT IN (31,47) ORDER BY j.pontos DESC,j.nome ASC`);
    res.json(result.rows.map(j => ({
      id:j.id,nome:j.nome,pontos:j.pontos,vitorias:j.vitorias,empate:j.empate,gols:j.gols,defesaClassificacao:j.defesa_classificacao,infracoes:j.infracoes,foto:j.foto,
      avaliacao:[j.avaliacao_defesa,j.avaliacao_ataque,j.avaliacao_velocidade,j.avaliacao_habilidade,j.avaliacao_passe].some(v=>v!==null&&v!==undefined)?{defesa:j.avaliacao_defesa,ataque:j.avaliacao_ataque,velocidade:j.avaliacao_velocidade,habilidade:j.avaliacao_habilidade,passe:j.avaliacao_passe}:null
    })));
  } catch (err) { console.error("Erro ao buscar desempenho técnico:", err); res.status(500).json({ error: "Erro ao buscar desempenho técnico" }); }
});

app.get("/montar-times", async (req, res) => {
  const partida = partidaId(req);
  try {
    const result = await pool.query(`SELECT m.id,m.partida,m.jogador_id,m.time_num,m.ordem,m.criado_em,j.nome,j.pontos,j.vitorias,j.empate,j.gols,j.defesa AS defesa_classificacao,j.infracoes,j.foto,a.defesa AS avaliacao_defesa,a.ataque AS avaliacao_ataque,a.velocidade AS avaliacao_velocidade,a.habilidade AS avaliacao_habilidade,a.passe AS avaliacao_passe FROM montagem_times m JOIN jogadores j ON j.id=m.jogador_id LEFT JOIN avaliacao_jogadores a ON a.jogador_id=j.id WHERE m.partida=$1 ORDER BY m.ordem ASC`, [partida]);
    res.json({ partida, selecoes: result.rows });
  } catch (err) { console.error("Erro ao buscar montagem:", err); res.status(500).json({ error: "Erro ao buscar montagem de times" }); }
});

app.post("/montar-times/selecionar", async (req, res) => {
  const partida = partidaId(req), jogadorId = Number(req.body.jogador_id ?? req.body.jogadorId), timeNum = Number(req.body.time_num ?? req.body.time);
  if (!Number.isInteger(jogadorId) || jogadorId<=0) return res.status(400).json({error:"jogador_id inválido"});
  if (!Number.isInteger(timeNum) || timeNum<1 || timeNum>MAX_TIMES) return res.status(400).json({error:"time inválido"});
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[partida]);
    const jogador=await client.query("SELECT id,nome FROM jogadores WHERE id=$1",[jogadorId]);
    if(!jogador.rows.length){await client.query("ROLLBACK");return res.status(404).json({error:"Jogador não encontrado"});}
    const existente=await client.query("SELECT id,time_num,ordem FROM montagem_times WHERE partida=$1 AND jogador_id=$2",[partida,jogadorId]);
    if(existente.rows.length){await client.query("ROLLBACK");return res.status(409).json({error:"Jogador já foi escolhido",selecao:existente.rows[0]});}
    const quantidade=await client.query("SELECT COUNT(*)::int AS total FROM montagem_times WHERE partida=$1 AND time_num=$2",[partida,timeNum]);
    if(quantidade.rows[0].total>=MAX_JOGADORES_TIME){await client.query("ROLLBACK");return res.status(409).json({error:"Este time já atingiu 7 jogadores"});}
    const ordemResult=await client.query("SELECT COALESCE(MAX(ordem),0)+1 AS ordem FROM montagem_times WHERE partida=$1",[partida]);
    const inserido=await client.query(`INSERT INTO montagem_times(partida,jogador_id,time_num,ordem) VALUES($1,$2,$3,$4) RETURNING id,partida,jogador_id,time_num,ordem,criado_em`,[partida,jogadorId,timeNum,Number(ordemResult.rows[0].ordem)]);
    await client.query("COMMIT");
    res.status(201).json({success:true,jogador:jogador.rows[0],selecao:inserido.rows[0]});
  } catch(err){try{await client.query("ROLLBACK")}catch(_){} console.error("Erro ao selecionar jogador:",err); if(err.code==="23505")return res.status(409).json({error:"Jogador já foi escolhido por outro líder"}); res.status(500).json({error:"Erro ao registrar seleção"});} finally{client.release();}
});

app.delete("/montar-times/:jogadorId", async (req,res)=>{
  const partida=partidaId(req), jogadorId=Number(req.params.jogadorId);
  if(!Number.isInteger(jogadorId)||jogadorId<=0)return res.status(400).json({error:"jogadorId inválido"});
  try{const result=await pool.query("DELETE FROM montagem_times WHERE partida=$1 AND jogador_id=$2 RETURNING *",[partida,jogadorId]);if(!result.rows.length)return res.status(404).json({error:"Seleção não encontrada"});res.json({success:true,selecao:result.rows[0]});}catch(err){console.error("Erro ao remover seleção:",err);res.status(500).json({error:"Erro ao remover seleção"});}
});

app.delete("/montar-times", async (req,res)=>{const partida=partidaId(req);try{const result=await pool.query("DELETE FROM montagem_times WHERE partida=$1 RETURNING id",[partida]);res.json({success:true,removidos:result.rowCount});}catch(err){console.error("Erro ao limpar montagem:",err);res.status(500).json({error:"Erro ao limpar montagem"});}});

app.get("/goleiros", async (req,res)=>{
  try {
    await goalkeeperReady;
    const competencia = await currentCompetencia();
    const result = await pool.query(`
      SELECT
        ROW_NUMBER() OVER (ORDER BY COALESCE(dm.pontos,g.pontos,0) DESC,
          COALESCE(dm.vitorias,g.vitorias,0) DESC,
          COALESCE(dm.defesas,g.defesa,0) DESC,g.nome ASC)::int AS posicao,
        g.id,g.nome,g.foto,g.criado_em,
        COALESCE(dm.pontos,g.pontos,0)::int AS pontos,
        COALESCE(dm.vitorias,g.vitorias,0)::int AS vitorias,
        COALESCE(dm.empates,g.empate,0)::int AS empate,
        COALESCE(dm.empates,g.empate,0)::int AS empates,
        COALESCE(dm.gols,g.gols,0)::int AS gols,
        COALESCE(dm.defesas,g.defesa,0)::int AS defesa,
        COALESCE(dm.defesas,g.defesa,0)::int AS defesas,
        COALESCE(dm.infracoes,g.infracoes,0)::int AS infracoes,
        COALESCE(dm.jogos_disputados,0)::int AS jogos_disputados,
        COALESCE(dm.derrotas,0)::int AS derrotas,
        COALESCE(dm.gols_sofridos,0)::int AS gols_sofridos,
        CASE WHEN COALESCE(dm.jogos_disputados,0)=0 THEN 0
          ELSE ROUND(COALESCE(dm.gols_sofridos,0)::numeric / dm.jogos_disputados, 2) END AS media_gols_sofridos,
        CASE WHEN COALESCE(dm.jogos_disputados,0)=0 THEN 0
          ELSE ROUND((COALESCE(dm.vitorias,0)::numeric * 100) / dm.jogos_disputados, 2) END AS aproveitamento_vitorias,
        $1::text AS competencia
      FROM goleiros g
      LEFT JOIN desempenho_mensal_goleiros dm ON dm.goleiro_id=g.id AND dm.competencia_id=$2
      ORDER BY pontos DESC,vitorias DESC,defesa DESC,g.nome ASC
    `, [competencia.chave, competencia.id]);
    res.json(result.rows);
  } catch(err) { console.error("Erro ao buscar goleiros:",err); res.status(500).json({error:"Erro ao buscar goleiros"}); }
});
app.get("/goleiros/ranking", async (req,res)=>{
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 3, 1), 50);
    await goalkeeperReady;
    const competencia = req.query.competencia
      ? (await pool.query("SELECT * FROM competencias WHERE chave=$1", [String(req.query.competencia)])).rows[0]
      : await currentCompetencia();
    if (!competencia) return res.status(404).json({error:"Competência não encontrada"});
    const result = await pool.query(`
      SELECT ROW_NUMBER() OVER (ORDER BY dm.pontos DESC,dm.vitorias DESC,dm.gols DESC,dm.defesas DESC,g.nome ASC)::int AS posicao,
        g.id AS goleiro_id,g.nome,g.foto,dm.pontos,dm.jogos_disputados,dm.vitorias,dm.empates,dm.derrotas,
        dm.defesas,dm.gols,dm.gols_sofridos,dm.infracoes,
        CASE WHEN dm.jogos_disputados=0 THEN 0 ELSE ROUND(dm.gols_sofridos::numeric / dm.jogos_disputados, 2) END AS media_gols_sofridos,
        CASE WHEN dm.jogos_disputados=0 THEN 0 ELSE ROUND((dm.vitorias::numeric * 100) / dm.jogos_disputados, 2) END AS aproveitamento_vitorias,
        CASE WHEN dm.jogos_disputados=0 THEN 0 ELSE ROUND(dm.defesas::numeric / dm.jogos_disputados, 2) END AS media_defesas
      FROM desempenho_mensal_goleiros dm JOIN goleiros g ON g.id=dm.goleiro_id
      WHERE dm.competencia_id=$1 ORDER BY posicao LIMIT $2
    `, [competencia.id, limit]);
    res.json({competencia:competencia.chave, ranking:result.rows});
  } catch(err) { console.error("Erro ao buscar ranking de goleiros:",err); res.status(500).json({error:"Erro ao buscar ranking de goleiros"}); }
});
app.get("/goleiros/:id/partidas", async (req,res)=>{
  try {
    await goalkeeperReady;
    const result = await pool.query(`SELECT p.id,p.operacao_id,p.resultado,p.defesas,p.gols,p.gols_sofridos,p.infracoes,p.pontos,p.registrada_em,c.chave AS competencia FROM partidas_goleiros p JOIN competencias c ON c.id=p.competencia_id WHERE p.goleiro_id=$1 ORDER BY p.registrada_em DESC`, [req.params.id]);
    res.json(result.rows);
  } catch(err) { console.error("Erro ao buscar partidas do goleiro:",err); res.status(500).json({error:"Erro ao buscar partidas do goleiro"}); }
});
app.get("/goleiros/:id/evolucao", async (req,res)=>{
  try {
    await goalkeeperReady;
    const result = await pool.query(`SELECT c.id,c.chave,c.nome,c.status,dm.pontos,dm.jogos_disputados,dm.vitorias,dm.empates,dm.derrotas,dm.defesas,dm.gols,dm.gols_sofridos,dm.infracoes,CASE WHEN dm.jogos_disputados=0 THEN 0 ELSE ROUND(dm.gols_sofridos::numeric / dm.jogos_disputados, 2) END AS media_gols_sofridos FROM desempenho_mensal_goleiros dm JOIN competencias c ON c.id=dm.competencia_id WHERE dm.goleiro_id=$1 ORDER BY c.chave ASC`, [req.params.id]);
    res.json(result.rows);
  } catch(err) { console.error("Erro ao buscar evolução do goleiro:",err); res.status(500).json({error:"Erro ao buscar evolução do goleiro"}); }
});
app.get("/goleiros/:id", async (req,res)=>{
  try {
    await goalkeeperReady;
    const result = await pool.query(`
      SELECT g.*,COALESCE(dm.pontos,g.pontos,0)::int AS pontos,
        COALESCE(dm.jogos_disputados,0)::int AS jogos_disputados,
        COALESCE(dm.vitorias,g.vitorias,0)::int AS vitorias,
        COALESCE(dm.empates,g.empate,0)::int AS empates,
        COALESCE(dm.derrotas,0)::int AS derrotas,
        COALESCE(dm.defesas,g.defesa,0)::int AS defesas,
        COALESCE(dm.gols,g.gols,0)::int AS gols,
        COALESCE(dm.gols_sofridos,0)::int AS gols_sofridos,
        CASE WHEN COALESCE(dm.jogos_disputados,0)=0 THEN 0 ELSE ROUND(dm.gols_sofridos::numeric / dm.jogos_disputados, 2) END AS media_gols_sofridos,
        CASE WHEN COALESCE(dm.jogos_disputados,0)=0 THEN 0 ELSE ROUND((dm.vitorias::numeric * 100) / dm.jogos_disputados, 2) END AS aproveitamento_vitorias,
        c.chave AS competencia
      FROM goleiros g LEFT JOIN LATERAL (SELECT * FROM competencias WHERE status='aberta' ORDER BY id DESC LIMIT 1) c ON TRUE
      LEFT JOIN desempenho_mensal_goleiros dm ON dm.goleiro_id=g.id AND dm.competencia_id=c.id
      WHERE g.id=$1
    `,[req.params.id]);
    if(!result.rows.length)return res.status(404).json({error:"Goleiro não encontrado"});
    res.json(result.rows[0]);
  } catch(err) { console.error("Erro ao buscar goleiro:",err);res.status(500).json({error:"Erro ao buscar goleiro"}); }
});
app.post("/goleiros", async (req,res)=>{
  const goleiro=normalizePlayer(req.body);
  try {
    await goalkeeperReady;
    const result=await pool.query("INSERT INTO goleiros (nome,pontos,vitorias,empate,defesa,gols,infracoes,foto) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",[goleiro.nome,goleiro.pontos,goleiro.vitorias,goleiro.empate,goleiro.defesa,goleiro.gols,goleiro.infracoes,goleiro.foto]);
    const competencia=await currentCompetencia();
    await pool.query("INSERT INTO desempenho_mensal_goleiros (competencia_id,goleiro_id,pontos,vitorias,empates,defesas,gols,infracoes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (competencia_id,goleiro_id) DO NOTHING",[competencia.id,result.rows[0].id,goleiro.pontos,goleiro.vitorias,goleiro.empate,goleiro.defesa,goleiro.gols,goleiro.infracoes]);
    res.status(201).json(result.rows[0]);
  } catch(err) { console.error("Erro ao salvar goleiro:",err);res.status(500).json({error:"Erro ao salvar goleiro"}); }
});
app.put("/goleiros/:id", async (req,res)=>{
  const goleiro=normalizePlayer(req.body);
  const client=await pool.connect();
  try{
    await goalkeeperReady;
    await client.query("BEGIN");
    const result=await client.query("UPDATE goleiros SET nome=$1,pontos=$2,vitorias=$3,empate=$4,defesa=$5,gols=$6,infracoes=$7,foto=$8 WHERE id=$9 RETURNING *",[goleiro.nome,goleiro.pontos,goleiro.vitorias,goleiro.empate,goleiro.defesa,goleiro.gols,goleiro.infracoes,goleiro.foto,req.params.id]);
    if(!result.rows.length){await client.query("ROLLBACK");return res.status(404).json({error:"Goleiro não encontrado"});}
    const competencia=await currentCompetencia(client);
    await client.query(`INSERT INTO desempenho_mensal_goleiros (competencia_id,goleiro_id,pontos,vitorias,empates,defesas,gols,infracoes)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (competencia_id,goleiro_id) DO UPDATE SET pontos=$3,vitorias=$4,empates=$5,defesas=$6,gols=$7,infracoes=$8,atualizado_em=NOW()`,
      [competencia.id,req.params.id,goleiro.pontos,goleiro.vitorias,goleiro.empate,goleiro.defesa,goleiro.gols,goleiro.infracoes]);
    await client.query("COMMIT");
    res.json({...result.rows[0],competencia:competencia.chave});
  }catch(err){await client.query("ROLLBACK").catch(()=>{});console.error("Erro ao atualizar goleiro:",err);res.status(500).json({error:"Erro ao atualizar goleiro"});}
  finally{client.release();}
});
app.post("/goleiros/:id/foto", uploadGoalkeeperPhoto.single("foto"), async (req,res)=>{
  const goleiroId=Number(req.params.id);
  if(!Number.isInteger(goleiroId)||goleiroId<=0){if(req.file?.path)fs.rmSync(req.file.path,{force:true});return res.status(400).json({success:false,error:"ID do goleiro inválido"});}
  if(!req.file)return res.status(400).json({success:false,error:"Envie uma imagem no campo multipart 'foto'"});
  try{
    const goleiro=await pool.query("SELECT id,nome,foto FROM goleiros WHERE id=$1",[goleiroId]);
    if(!goleiro.rows.length){fs.rmSync(req.file.path,{force:true});return res.status(404).json({success:false,error:"Goleiro não encontrado"});}
    const baseUrl=`${req.protocol}://${req.get("host")}`;
    const fotoUrl=`${baseUrl}/uploads/goleiros/${encodeURIComponent(req.file.filename)}`;
    const atualizada=await pool.query("UPDATE goleiros SET foto=$1 WHERE id=$2 RETURNING id,nome,foto",[fotoUrl,goleiroId]);
    const fotoAnterior=goleiro.rows[0].foto;
    if(fotoAnterior){try{const pathname=new URL(fotoAnterior,baseUrl).pathname;const prefixo="/uploads/goleiros/";if(pathname.startsWith(prefixo))fs.rmSync(path.join(GOALKEEPER_PHOTO_ROOT,path.basename(pathname)),{force:true});}catch(cleanupError){console.warn("Não foi possível remover a foto anterior do goleiro:",cleanupError.message);}}
    return res.status(201).json({success:true,goleiro_id:atualizada.rows[0].id,nome:atualizada.rows[0].nome,foto:atualizada.rows[0].foto});
  }catch(err){fs.rmSync(req.file.path,{force:true});console.error("Erro ao atualizar foto do goleiro:",err);return res.status(500).json({success:false,error:"Erro ao salvar foto do goleiro"});}
});
app.delete("/goleiros/:id", async (req,res)=>{try{const result=await pool.query("DELETE FROM goleiros WHERE id=$1 RETURNING *",[req.params.id]);if(!result.rows.length)return res.status(404).json({error:"Goleiro não encontrado"});res.json({success:true});}catch(err){console.error("Erro ao excluir goleiro:",err);res.status(500).json({error:"Erro ao excluir goleiro"});}});

function validateRegistroPartida(data){
  const erros=[];
  if(!data.operacao_id||typeof data.operacao_id!=="string"||data.operacao_id.trim()==="")erros.push("operacao_id é obrigatório e deve ser string");
  if(data.coletivo){
    if(!Array.isArray(data.coletivo.jogadores))erros.push("coletivo.jogadores deve ser array");
    else if(data.coletivo.jogadores.length===0)erros.push("coletivo.jogadores não pode estar vazio");
    for(const campo of ["vitorias","empate","defesa","gols","infracoes"]){if(data.coletivo[campo]!==undefined&&typeof data.coletivo[campo]!=="number")erros.push(`coletivo.${campo} deve ser number`);if(data.coletivo[campo]!==undefined&&data.coletivo[campo]<0)erros.push(`coletivo.${campo} não pode ser negativo`);}
  }
  if(data.individual&&Array.isArray(data.individual))for(const evento of data.individual){if(!Number.isInteger(evento.jogador_id)||evento.jogador_id<=0)erros.push(`individual: jogador_id inválido (${evento.jogador_id})`);for(const campo of ["vitorias","empate","defesa","gols","infracoes"]){if(evento[campo]!==undefined&&typeof evento[campo]!=="number")erros.push(`individual[${evento.jogador_id}].${campo} deve ser number`);if(evento[campo]!==undefined&&evento[campo]<0)erros.push(`individual[${evento.jogador_id}].${campo} não pode ser negativo`);}}
  if(data.goleiros!==undefined&&!Array.isArray(data.goleiros))erros.push("goleiros deve ser array");
  if(Array.isArray(data.goleiros)){
    const ids=new Set();
    for(const evento of data.goleiros){
      if(!Number.isInteger(evento.goleiro_id)||evento.goleiro_id<=0)erros.push(`goleiros: goleiro_id inválido (${evento.goleiro_id})`);
      if(ids.has(evento.goleiro_id))erros.push(`goleiros: goleiro_id duplicado (${evento.goleiro_id})`);
      ids.add(evento.goleiro_id);
      if(!["vitoria","empate","derrota"].includes(evento.resultado))erros.push(`goleiros[${evento.goleiro_id}].resultado deve ser vitoria, empate ou derrota`);
      for(const campo of ["defesas","gols","gols_sofridos","infracoes"]){if(evento[campo]!==undefined&&typeof evento[campo]!=="number")erros.push(`goleiros[${evento.goleiro_id}].${campo} deve ser number`);if(evento[campo]!==undefined&&evento[campo]<0)erros.push(`goleiros[${evento.goleiro_id}].${campo} não pode ser negativo`);}
    }
  }
  return erros;
}

app.post("/partida/registrar", async (req,res)=>{
  const {operacao_id,coletivo,individual,goleiros}=req.body;
  const erros=validateRegistroPartida(req.body);
  if(erros.length)return res.status(400).json({error:"Validação falhou",detalhes:erros});
  const client=await pool.connect();
  try{
    await goalkeeperReady;
    await client.query("BEGIN");
    const jaProcessada=await client.query("SELECT operacao_id FROM partida_operacoes WHERE operacao_id=$1",[operacao_id]);
    if(jaProcessada.rows.length){await client.query("ROLLBACK");return res.status(409).json({error:"Operação já foi processada",operacao_id});}
    const todosIds=new Set();
    if(coletivo&&Array.isArray(coletivo.jogadores))coletivo.jogadores.forEach(id=>todosIds.add(id));
    if(individual&&Array.isArray(individual))individual.forEach(e=>todosIds.add(e.jogador_id));
    if(todosIds.size){const resultado=await client.query("SELECT id FROM jogadores WHERE id=ANY($1)",[Array.from(todosIds)]);const encontrados=new Set(resultado.rows.map(r=>r.id));const faltando=Array.from(todosIds).filter(id=>!encontrados.has(id));if(faltando.length){await client.query("ROLLBACK");return res.status(400).json({error:"Jogadores não encontrados",ids:faltando});}}
    const goleiroIds=Array.isArray(goleiros)?goleiros.map(e=>e.goleiro_id):[];
    if(goleiroIds.length){const resultado=await client.query("SELECT id FROM goleiros WHERE id=ANY($1)",[goleiroIds]);const encontrados=new Set(resultado.rows.map(r=>r.id));const faltando=goleiroIds.filter(id=>!encontrados.has(id));if(faltando.length){await client.query("ROLLBACK");return res.status(400).json({error:"Goleiros não encontrados",ids:faltando});}}
    const atualizacoes={};
    if(coletivo&&Array.isArray(coletivo.jogadores))for(const id of coletivo.jogadores){if(!atualizacoes[id])atualizacoes[id]={vitorias:0,empate:0,defesa:0,gols:0,infracoes:0};for(const campo of ["vitorias","empate","defesa","gols","infracoes"])if(coletivo[campo]!==undefined)atualizacoes[id][campo]+=coletivo[campo];}
    if(individual&&Array.isArray(individual))for(const e of individual){const {jogador_id,vitorias,empate,defesa,gols,infracoes}=e;if(!atualizacoes[jogador_id])atualizacoes[jogador_id]={vitorias:0,empate:0,defesa:0,gols:0,infracoes:0};if(vitorias!==undefined)atualizacoes[jogador_id].vitorias+=vitorias;if(empate!==undefined)atualizacoes[jogador_id].empate+=empate;if(defesa!==undefined)atualizacoes[jogador_id].defesa+=defesa;if(gols!==undefined)atualizacoes[jogador_id].gols+=gols;if(infracoes!==undefined)atualizacoes[jogador_id].infracoes+=infracoes;}
    const jogadoresAtualizados=[];
    for(const [idStr,inc] of Object.entries(atualizacoes)){
      const id=Number(idStr), jogadorResult=await client.query("SELECT * FROM jogadores WHERE id=$1",[id]);
      if(!jogadorResult.rows.length){await client.query("ROLLBACK");return res.status(400).json({error:"Jogador não encontrado durante processamento",jogador_id:id});}
      const competencia=await currentCompetencia(client);
      const atualResult=await client.query("SELECT * FROM desempenho_mensal WHERE competencia_id=$1 AND jogador_id=$2 FOR UPDATE",[competencia.id,id]);
      const atual=atualResult.rows[0] || {vitorias:0,empate:0,defesa:0,gols:0,infracoes:0};
      const novos={vitorias:Math.max(0,(atual.vitorias||0)+(inc.vitorias||0)),empate:Math.max(0,(atual.empate||0)+(inc.empate||0)),defesa:Math.max(0,(atual.defesa||0)+(inc.defesa||0)),gols:Math.max(0,(atual.gols||0)+(inc.gols||0)),infracoes:Math.max(0,(atual.infracoes||0)+(inc.infracoes||0))};
      const pontos=calculatePoints(novos.vitorias,novos.empate,novos.defesa,novos.gols,novos.infracoes);
      const atualizado=await client.query(`INSERT INTO desempenho_mensal (competencia_id,jogador_id,vitorias,empate,defesa,gols,infracoes,pontos) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (competencia_id,jogador_id) DO UPDATE SET vitorias=$3,empate=$4,defesa=$5,gols=$6,infracoes=$7,pontos=$8,atualizado_em=NOW() RETURNING *`,[competencia.id,id,novos.vitorias,novos.empate,novos.defesa,novos.gols,novos.infracoes,pontos]);
      jogadoresAtualizados.push({...jogadorResult.rows[0],...atualizado.rows[0]});
    }
    const goleirosAtualizados=[];
    if(Array.isArray(goleiros)&&goleiros.length){
      const competencia=await currentCompetencia(client);
      for(const evento of goleiros){
        const id=Number(evento.goleiro_id);
        const atualResult=await client.query("SELECT * FROM desempenho_mensal_goleiros WHERE competencia_id=$1 AND goleiro_id=$2 FOR UPDATE",[competencia.id,id]);
        const atual=atualResult.rows[0]||{jogos_disputados:0,vitorias:0,empates:0,derrotas:0,defesas:0,gols_sofridos:0,infracoes:0};
        const inc={jogos_disputados:1,vitorias:evento.resultado==="vitoria"?1:0,empates:evento.resultado==="empate"?1:0,derrotas:evento.resultado==="derrota"?1:0,defesas:Number(evento.defesas)||0,gols:Number(evento.gols)||0,gols_sofridos:Number(evento.gols_sofridos)||0,infracoes:Number(evento.infracoes)||0};
        const novos={jogos_disputados:Number(atual.jogos_disputados||0)+inc.jogos_disputados,vitorias:Number(atual.vitorias||0)+inc.vitorias,empates:Number(atual.empates||0)+inc.empates,derrotas:Number(atual.derrotas||0)+inc.derrotas,defesas:Number(atual.defesas||0)+inc.defesas,gols:Number(atual.gols||0)+inc.gols,gols_sofridos:Number(atual.gols_sofridos||0)+inc.gols_sofridos,infracoes:Number(atual.infracoes||0)+inc.infracoes};
        const pontos=calculatePoints(novos.vitorias,novos.empates,novos.defesas,novos.gols,novos.infracoes);
        const atualizado=await client.query(`INSERT INTO desempenho_mensal_goleiros (competencia_id,goleiro_id,pontos,jogos_disputados,vitorias,empates,derrotas,defesas,gols,gols_sofridos,infracoes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(competencia_id,goleiro_id) DO UPDATE SET pontos=$3,jogos_disputados=$4,vitorias=$5,empates=$6,derrotas=$7,defesas=$8,gols=$9,gols_sofridos=$10,infracoes=$11,atualizado_em=NOW() RETURNING *`,[competencia.id,id,pontos,novos.jogos_disputados,novos.vitorias,novos.empates,novos.derrotas,novos.defesas,novos.gols,novos.gols_sofridos,novos.infracoes]);
        const eventoPontos=calculatePoints(inc.vitorias,inc.empates,inc.defesas,inc.gols,inc.infracoes);
        await client.query(`UPDATE goleiros SET pontos=COALESCE(pontos,0)+$1,vitorias=COALESCE(vitorias,0)+$2,empate=COALESCE(empate,0)+$3,defesa=COALESCE(defesa,0)+$4,gols=COALESCE(gols,0)+$5,infracoes=COALESCE(infracoes,0)+$6 WHERE id=$7`,[eventoPontos,inc.vitorias,inc.empates,inc.defesas,inc.gols,inc.infracoes,id]);
        await client.query(`INSERT INTO partidas_goleiros (operacao_id,competencia_id,goleiro_id,resultado,defesas,gols,gols_sofridos,infracoes,pontos) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[operacao_id,competencia.id,id,evento.resultado,inc.defesas,inc.gols,inc.gols_sofridos,inc.infracoes,eventoPontos]);
        goleirosAtualizados.push(atualizado.rows[0]);
      }
    }
    await client.query("INSERT INTO partida_operacoes (operacao_id,jogadores_afetados) VALUES($1,$2)",[operacao_id,JSON.stringify({jogadores:Object.keys(atualizacoes).map(Number),goleiros:goleiroIds})]);
    await client.query("COMMIT");
    res.status(201).json({success:true,operacao_id,jogadores_atualizados:jogadoresAtualizados,goleiros_atualizados:goleirosAtualizados,total:jogadoresAtualizados.length+goleirosAtualizados.length});
  }catch(err){try{await client.query("ROLLBACK")}catch(_){}console.error("Erro ao registrar partida:",err);res.status(500).json({error:"Erro ao registrar partida",detalhes:err.message});}finally{client.release();}
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ success: false, error: "A imagem excede o limite de 5 MB" });
    }
    return res.status(400).json({ success: false, error: `Falha no upload: ${err.message}` });
  }
  if (err) {
    console.error("Erro de requisição:", err);
    return res.status(400).json({ success: false, error: err.message || "Requisição inválida" });
  }
  return res.status(500).json({ success: false, error: "Erro interno do servidor" });
});

/* ======================================================
   START SERVER

   A API deve abrir a porta mesmo se uma migração de banco
   falhar. Isso evita que o proxy/Cloudflare receba 502.
   As tabelas são preparadas em segundo plano.
====================================================== */

app.listen(PORT, () => {
  console.log(`API FutPontos rodando na porta ${PORT}`);
  Promise.all([monthlyReady, goalkeeperReady, ensureMontagemTable(), ensurePartidaOperacoesTable()])
    .then(() => console.log("Banco preparado com sucesso."))
    .catch((err) => console.error("Erro ao preparar banco de dados (API continua online):", err));
});

process.on("SIGTERM", async () => {
  await pool.end().catch(() => {});
  process.exit(0);
});

process.on("SIGINT", async () => {
  await pool.end().catch(() => {});
  process.exit(0);
});

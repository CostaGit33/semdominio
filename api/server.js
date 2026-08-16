require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const { Pool } = require("pg");

const app = express();

app.use(cors());
app.use(express.json());

/* ======================================================
   DATABASE
====================================================== */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/* ======================================================
   CONFIG
====================================================== */

const PORT = process.env.PORT || 3000;
const DEFAULT_PARTIDA = "atual";
const MAX_TIMES = 5;
const MAX_JOGADORES_TIME = 7;

/* ======================================================
   PONTUAÇÃO OFICIAL
====================================================== */

function calculatePoints(
  vitorias = 0,
  empate = 0,
  defesa = 0,
  gols = 0,
  infracoes = 0
) {
  return (
    (Number(vitorias) * 3) +
    (Number(empate) * 1) +
    (Number(defesa) * 1) +
    (Number(gols) * 2) -
    (Number(infracoes) * 2)
  );
}

/* ======================================================
   HELPERS
====================================================== */

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

  jogador.pontos = calculatePoints(
    jogador.vitorias,
    jogador.empate,
    jogador.defesa,
    jogador.gols,
    jogador.infracoes
  );

  return jogador;
}

function partidaId(req) {
  const valor = String(req.query.partida || req.body?.partida || DEFAULT_PARTIDA).trim();
  return valor.slice(0, 80) || DEFAULT_PARTIDA;
}

/* ======================================================
   TABELA DA MONTAGEM DE TIMES

   A seleção fica no PostgreSQL, e não no navegador.
   Isso permite que vários celulares/computadores vejam
   exatamente a mesma seleção em tempo real.
====================================================== */

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

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_montagem_times_partida
    ON montagem_times (partida, time_num, ordem)
  `);
}

/* ======================================================
   STATUS API
====================================================== */

app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "API FutPontos ONLINE"
  });
});

/* ======================================================
   PWA
====================================================== */

app.get("/manifest.json", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "manifest.json"));
});

app.get("/sw.js", (req, res) => {
  res.setHeader("Service-Worker-Allowed", "/");
  res.setHeader("Content-Type", "application/javascript");
  res.sendFile(path.join(__dirname, "public", "sw.js"));
});

/* ======================================================
   JOGADORES
====================================================== */

app.get("/jogadores", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM jogadores
      ORDER BY pontos DESC, vitorias DESC, gols DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("Erro ao buscar jogadores:", err);
    res.status(500).json({ error: "Erro ao buscar jogadores" });
  }
});

app.get("/jogadores/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "SELECT * FROM jogadores WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Jogador não encontrado" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao buscar jogador:", err);
    res.status(500).json({ error: "Erro ao buscar jogador" });
  }
});

app.post("/jogadores", async (req, res) => {
  const jogador = normalizePlayer(req.body);

  try {
    const result = await pool.query(
      `
      INSERT INTO jogadores
      (nome, pontos, vitorias, empate, defesa, gols, infracoes, foto)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
      `,
      [
        jogador.nome,
        jogador.pontos,
        jogador.vitorias,
        jogador.empate,
        jogador.defesa,
        jogador.gols,
        jogador.infracoes,
        jogador.foto
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao salvar jogador:", err);
    res.status(500).json({ error: "Erro ao salvar jogador" });
  }
});

app.put("/jogadores/:id", async (req, res) => {
  const { id } = req.params;
  const jogador = normalizePlayer(req.body);

  try {
    const result = await pool.query(
      `
      UPDATE jogadores
      SET nome = $1, pontos = $2, vitorias = $3, empate = $4,
          defesa = $5, gols = $6, infracoes = $7, foto = $8
      WHERE id = $9
      RETURNING *
      `,
      [
        jogador.nome,
        jogador.pontos,
        jogador.vitorias,
        jogador.empate,
        jogador.defesa,
        jogador.gols,
        jogador.infracoes,
        jogador.foto,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Jogador não encontrado" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao atualizar jogador:", err);
    res.status(500).json({ error: "Erro ao atualizar jogador" });
  }
});

app.delete("/jogadores/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "DELETE FROM jogadores WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Jogador não encontrado" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Erro ao excluir jogador:", err);
    res.status(500).json({ error: "Erro ao excluir jogador" });
  }
});

/* ======================================================
   DESEMPENHO TÉCNICO
====================================================== */

app.get("/desempenho", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        j.id,
        j.nome,
        j.pontos,
        j.vitorias,
        j.empate,
        j.gols,
        j.defesa AS defesa_classificacao,
        j.infracoes,
        j.foto,
        a.defesa AS avaliacao_defesa,
        a.ataque AS avaliacao_ataque,
        a.velocidade AS avaliacao_velocidade,
        a.habilidade AS avaliacao_habilidade,
        a.passe AS avaliacao_passe
      FROM jogadores j
      LEFT JOIN avaliacao_jogadores a
        ON a.jogador_id = j.id
      WHERE j.id NOT IN (31, 47)
      ORDER BY j.pontos DESC, j.nome ASC
    `);

    const jogadores = result.rows.map((jogador) => {
      const possuiAvaliacao = [
        jogador.avaliacao_defesa,
        jogador.avaliacao_ataque,
        jogador.avaliacao_velocidade,
        jogador.avaliacao_habilidade,
        jogador.avaliacao_passe
      ].some((valor) => valor !== null && valor !== undefined);

      return {
        id: jogador.id,
        nome: jogador.nome,
        pontos: jogador.pontos,
        vitorias: jogador.vitorias,
        empate: jogador.empate,
        gols: jogador.gols,
        defesaClassificacao: jogador.defesa_classificacao,
        infracoes: jogador.infracoes,
        foto: jogador.foto,
        avaliacao: possuiAvaliacao
          ? {
              defesa: jogador.avaliacao_defesa,
              ataque: jogador.avaliacao_ataque,
              velocidade: jogador.avaliacao_velocidade,
              habilidade: jogador.avaliacao_habilidade,
              passe: jogador.avaliacao_passe
            }
          : null
      };
    });

    res.json(jogadores);
  } catch (err) {
    console.error("Erro ao buscar desempenho técnico:", err);
    res.status(500).json({ error: "Erro ao buscar desempenho técnico" });
  }
});

/* ======================================================
   MONTAGEM DE TIMES — ESTADO COMPARTILHADO

   GET  /montar-times              estado atual
   POST /montar-times/selecionar   escolhe um jogador
   DELETE /montar-times/:jogadorId remove um jogador
   DELETE /montar-times            limpa a partida

   A escolha é gravada no banco. O UNIQUE(partida,jogador_id)
   impede que dois líderes escolham o mesmo jogador.
   Um advisory lock por partida evita duas escolhas simultâneas
   receberem a mesma ordem.
====================================================== */

app.get("/montar-times", async (req, res) => {
  const partida = partidaId(req);

  try {
    const result = await pool.query(`
      SELECT
        m.id,
        m.partida,
        m.jogador_id,
        m.time_num,
        m.ordem,
        m.criado_em,
        j.nome,
        j.pontos,
        j.vitorias,
        j.empate,
        j.gols,
        j.defesa AS defesa_classificacao,
        j.infracoes,
        j.foto,
        a.defesa AS avaliacao_defesa,
        a.ataque AS avaliacao_ataque,
        a.velocidade AS avaliacao_velocidade,
        a.habilidade AS avaliacao_habilidade,
        a.passe AS avaliacao_passe
      FROM montagem_times m
      JOIN jogadores j ON j.id = m.jogador_id
      LEFT JOIN avaliacao_jogadores a ON a.jogador_id = j.id
      WHERE m.partida = $1
      ORDER BY m.ordem ASC
    `, [partida]);

    res.json({ partida, selecoes: result.rows });
  } catch (err) {
    console.error("Erro ao buscar montagem:", err);
    res.status(500).json({ error: "Erro ao buscar montagem de times" });
  }
});

app.post("/montar-times/selecionar", async (req, res) => {
  const partida = partidaId(req);
  const jogadorId = Number(req.body.jogador_id ?? req.body.jogadorId);
  const timeNum = Number(req.body.time_num ?? req.body.time);

  if (!Number.isInteger(jogadorId) || jogadorId <= 0) {
    return res.status(400).json({ error: "jogador_id inválido" });
  }

  if (!Number.isInteger(timeNum) || timeNum < 1 || timeNum > MAX_TIMES) {
    return res.status(400).json({ error: "time inválido" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Serializa as escolhas da mesma partida.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [partida]);

    const jogador = await client.query(
      "SELECT id, nome FROM jogadores WHERE id = $1",
      [jogadorId]
    );

    if (jogador.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Jogador não encontrado" });
    }

    const existente = await client.query(
      "SELECT id, time_num, ordem FROM montagem_times WHERE partida = $1 AND jogador_id = $2",
      [partida, jogadorId]
    );

    if (existente.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "Jogador já foi escolhido",
        selecao: existente.rows[0]
      });
    }

    const quantidade = await client.query(
      "SELECT COUNT(*)::int AS total FROM montagem_times WHERE partida = $1 AND time_num = $2",
      [partida, timeNum]
    );

    if (quantidade.rows[0].total >= MAX_JOGADORES_TIME) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Este time já atingiu 7 jogadores" });
    }

    const ordemResult = await client.query(
      "SELECT COALESCE(MAX(ordem), 0) + 1 AS ordem FROM montagem_times WHERE partida = $1",
      [partida]
    );

    const ordem = Number(ordemResult.rows[0].ordem);

    const inserido = await client.query(`
      INSERT INTO montagem_times (partida, jogador_id, time_num, ordem)
      VALUES ($1,$2,$3,$4)
      RETURNING id, partida, jogador_id, time_num, ordem, criado_em
    `, [partida, jogadorId, timeNum, ordem]);

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      jogador: jogador.rows[0],
      selecao: inserido.rows[0]
    });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("Erro ao selecionar jogador:", err);

    if (err.code === "23505") {
      return res.status(409).json({ error: "Jogador já foi escolhido por outro líder" });
    }

    res.status(500).json({ error: "Erro ao registrar seleção" });
  } finally {
    client.release();
  }
});

app.delete("/montar-times/:jogadorId", async (req, res) => {
  const partida = partidaId(req);
  const jogadorId = Number(req.params.jogadorId);

  if (!Number.isInteger(jogadorId) || jogadorId <= 0) {
    return res.status(400).json({ error: "jogadorId inválido" });
  }

  try {
    const result = await pool.query(
      `DELETE FROM montagem_times
       WHERE partida = $1 AND jogador_id = $2
       RETURNING *`,
      [partida, jogadorId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Seleção não encontrada" });
    }

    res.json({ success: true, selecao: result.rows[0] });
  } catch (err) {
    console.error("Erro ao remover seleção:", err);
    res.status(500).json({ error: "Erro ao remover seleção" });
  }
});

app.delete("/montar-times", async (req, res) => {
  const partida = partidaId(req);

  try {
    const result = await pool.query(
      "DELETE FROM montagem_times WHERE partida = $1 RETURNING id",
      [partida]
    );

    res.json({ success: true, removidos: result.rowCount });
  } catch (err) {
    console.error("Erro ao limpar montagem:", err);
    res.status(500).json({ error: "Erro ao limpar montagem" });
  }
});

/* ======================================================
   GOLEIROS
====================================================== */

app.get("/goleiros", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM goleiros
      ORDER BY pontos DESC, vitorias DESC, defesa DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("Erro ao buscar goleiros:", err);
    res.status(500).json({ error: "Erro ao buscar goleiros" });
  }
});

app.get("/goleiros/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "SELECT * FROM goleiros WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Goleiro não encontrado" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao buscar goleiro:", err);
    res.status(500).json({ error: "Erro ao buscar goleiro" });
  }
});

app.post("/goleiros", async (req, res) => {
  const goleiro = normalizePlayer(req.body);

  try {
    const result = await pool.query(
      `
      INSERT INTO goleiros
      (nome, pontos, vitorias, empate, defesa, gols, infracoes, foto)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
      `,
      [
        goleiro.nome,
        goleiro.pontos,
        goleiro.vitorias,
        goleiro.empate,
        goleiro.defesa,
        goleiro.gols,
        goleiro.infracoes,
        goleiro.foto
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao salvar goleiro:", err);
    res.status(500).json({ error: "Erro ao salvar goleiro" });
  }
});

app.put("/goleiros/:id", async (req, res) => {
  const { id } = req.params;
  const goleiro = normalizePlayer(req.body);

  try {
    const result = await pool.query(
      `
      UPDATE goleiros
      SET nome = $1, pontos = $2, vitorias = $3, empate = $4,
          defesa = $5, gols = $6, infracoes = $7, foto = $8
      WHERE id = $9
      RETURNING *
      `,
      [
        goleiro.nome,
        goleiro.pontos,
        goleiro.vitorias,
        goleiro.empate,
        goleiro.defesa,
        goleiro.gols,
        goleiro.infracoes,
        goleiro.foto,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Goleiro não encontrado" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao atualizar goleiro:", err);
    res.status(500).json({ error: "Erro ao atualizar goleiro" });
  }
});

app.delete("/goleiros/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "DELETE FROM goleiros WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Goleiro não encontrado" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Erro ao excluir goleiro:", err);
    res.status(500).json({ error: "Erro ao excluir goleiro" });
  }
});

/* ======================================================
   START SERVER
====================================================== */

ensureMontagemTable()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`API FutPontos rodando na porta ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Erro ao preparar banco de dados:", err);
    process.exit(1);
  });

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
   Usa jogadores + avaliacao_jogadores por jogador_id.
   Não altera a API de classificação.
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
    res.status(500).json({
      error: "Erro ao buscar desempenho técnico"
    });
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

app.listen(PORT, () => {
  console.log(`API FutPontos rodando na porta ${PORT}`);
});

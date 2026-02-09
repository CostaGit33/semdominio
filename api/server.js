require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();

/* ======================================================
   MIDDLEWARES
====================================================== */
app.use(cors());
app.use(express.json());

/* ======================================================
   DATABASE
====================================================== */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/* ======================================================
   HEALTH CHECK
====================================================== */
app.get("/", (req, res) => {
  res.send("🚀 API FutPontos ONLINE");
});

/* ======================================================
   FUNÇÃO OFICIAL DE CÁLCULO DE PONTOS
   Vitória   = +3
   Gol       = +2
   Empate    = +1
   Defesa    = +1
   Infração  = -2
====================================================== */
function calcularPontos({
  vitorias = 0,
  gols = 0,
  empate = 0,
  defesa = 0,
  infracoes = 0,
}) {
  return (
    Number(vitorias) * 3 +
    Number(gols) * 2 +
    Number(empate) +
    Number(defesa) -
    Number(infracoes) * 2
  );
}

/* ======================================================
   LISTAR JOGADORES (PADRÃO)
====================================================== */
app.get("/jogadores", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM jogadores
      ORDER BY pontos DESC, nome ASC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("Erro ao buscar jogadores:", err);
    res.status(500).json({ error: "Erro ao buscar jogadores" });
  }
});

/* ======================================================
   LISTAR JOGADORES2 (USADO NO FRONTEND)
====================================================== */
app.get("/jogadores2", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        nome,
        foto,
        vitorias,
        gols,
        empate,
        defesa,
        infracoes,
        pontos,
        criado_em
      FROM jogadores
      ORDER BY pontos DESC, id ASC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("Erro ao buscar jogadores2:", err);
    res.status(500).json({ error: "Erro ao buscar jogadores2" });
  }
});

/* ======================================================
   BUSCAR JOGADOR POR ID
====================================================== */
app.get("/jogadores/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "SELECT * FROM jogadores WHERE id = $1",
      [id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Jogador não encontrado" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao buscar jogador:", err);
    res.status(500).json({ error: "Erro ao buscar jogador" });
  }
});

/* ======================================================
   ADICIONAR JOGADOR
====================================================== */
app.post("/jogadores", async (req, res) => {
  const {
    nome,
    foto,
    vitorias = 0,
    gols = 0,
    empate = 0,
    defesa = 0,
    infracoes = 0,
  } = req.body;

  if (!nome) {
    return res.status(400).json({ error: "Nome é obrigatório" });
  }

  const pontos = calcularPontos({
    vitorias,
    gols,
    empate,
    defesa,
    infracoes,
  });

  try {
    const result = await pool.query(
      `
      INSERT INTO jogadores
        (nome, foto, vitorias, gols, empate, defesa, infracoes, pontos)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *;
      `,
      [
        nome,
        foto || null,
        vitorias,
        gols,
        empate,
        defesa,
        infracoes,
        pontos,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao salvar jogador:", err);
    res.status(500).json({ error: "Erro ao salvar jogador" });
  }
});

/* ======================================================
   ATUALIZAR JOGADOR
====================================================== */
app.put("/jogadores/:id", async (req, res) => {
  const { id } = req.params;

  const {
    nome,
    foto,
    vitorias = 0,
    gols = 0,
    empate = 0,
    defesa = 0,
    infracoes = 0,
  } = req.body;

  if (!nome) {
    return res.status(400).json({ error: "Nome é obrigatório" });
  }

  const pontos = calcularPontos({
    vitorias,
    gols,
    empate,
    defesa,
    infracoes,
  });

  try {
    const result = await pool.query(
      `
      UPDATE jogadores SET
        nome = $1,
        foto = $2,
        vitorias = $3,
        gols = $4,
        empate = $5,
        defesa = $6,
        infracoes = $7,
        pontos = $8
      WHERE id = $9
      RETURNING *;
      `,
      [
        nome,
        foto || null,
        vitorias,
        gols,
        empate,
        defesa,
        infracoes,
        pontos,
        id,
      ]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Jogador não encontrado" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao atualizar jogador:", err);
    res.status(500).json({ error: "Erro ao atualizar jogador" });
  }
});

/* ======================================================
   DELETAR JOGADOR
====================================================== */
app.delete("/jogadores/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "DELETE FROM jogadores WHERE id = $1",
      [id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Jogador não encontrado" });
    }

    res.json({ message: "Jogador removido com sucesso" });
  } catch (err) {
    console.error("Erro ao deletar jogador:", err);
    res.status(500).json({ error: "Erro ao remover jogador" });
  }
});

/* ======================================================
   START SERVER
====================================================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 API FutPontos rodando na porta ${PORT}`);
});

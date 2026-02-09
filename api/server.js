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
   FUNÇÃO OFICIAL DE PONTUAÇÃO
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
   JOGADORES (LINHA)
====================================================== */
app.get("/jogadores", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM jogadores
      WHERE tipo = 'jogador'
      ORDER BY pontos DESC, nome ASC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar jogadores" });
  }
});

/* ======================================================
   GOLEIROS (ENDPOINT NOVO)
====================================================== */
app.get("/goleiros", async (req, res) => {
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
      WHERE tipo = 'goleiro'
      ORDER BY pontos DESC, nome ASC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar goleiros" });
  }
});

/* ======================================================
   CREATE / UPDATE
====================================================== */
app.post("/jogadores", async (req, res) => {
  const {
    nome,
    foto,
    tipo = "jogador",
    vitorias = 0,
    gols = 0,
    empate = 0,
    defesa = 0,
    infracoes = 0,
  } = req.body;

  if (!nome) {
    return res.status(400).json({ error: "Nome obrigatório" });
  }

  const pontos = calcularPontos({
    vitorias,
    gols,
    empate,
    defesa,
    infracoes,
  });

  const result = await pool.query(
    `
    INSERT INTO jogadores
      (nome, foto, tipo, vitorias, gols, empate, defesa, infracoes, pontos)
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING *;
    `,
    [
      nome,
      foto || null,
      tipo,
      vitorias,
      gols,
      empate,
      defesa,
      infracoes,
      pontos,
    ]
  );

  res.status(201).json(result.rows[0]);
});

/* ======================================================
   START
====================================================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 API FutPontos rodando na porta ${PORT}`);
});

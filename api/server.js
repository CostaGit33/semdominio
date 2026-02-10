require("dotenv").config()
const express = require("express")
const cors = require("cors")
const { Pool } = require("pg")

const app = express()
app.use(cors())
app.use(express.json())

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
})

// Teste de conexão
app.get("/", (req, res) => {
  res.json({ status: "online", message: "API FutPontos ONLINE" })
})

/* ======================================================
   ENDPOINTS JOGADORES (TABELA PRINCIPAL)
====================================================== */

// Listar todos os jogadores
app.get("/jogadores", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM jogadores ORDER BY id DESC")
    res.json(result.rows)
  } catch (err) {
    console.error("Erro ao buscar jogadores:", err)
    res.status(500).json({ error: "Erro ao buscar jogadores" })
  }
})

// Buscar um jogador específico por ID
app.get("/jogadores/:id", async (req, res) => {
  const { id } = req.params
  try {
    const result = await pool.query("SELECT * FROM jogadores WHERE id = $1", [id])
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Jogador não encontrado" })
    }
    res.json(result.rows[0])
  } catch (err) {
    console.error("Erro ao buscar jogador:", err)
    res.status(500).json({ error: "Erro ao buscar jogador" })
  }
})

// Criar novo jogador
app.post("/jogadores", async (req, res) => {
  const { nome, time, vitorias, empate, defesa, gols, infracoes, foto } = req.body

  try {
    const result = await pool.query(
      "INSERT INTO jogadores (nome, time, vitorias, empate, defesa, gols, infracoes, foto) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
      [nome, time, vitorias || 0, empate || 0, defesa || 0, gols || 0, infracoes || 0, foto]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error("Erro ao salvar jogador:", err)
    res.status(500).json({ error: "Erro ao salvar jogador" })
  }
})

// Atualizar jogador existente
app.put("/jogadores/:id", async (req, res) => {
  const { id } = req.params
  const { nome, time, vitorias, empate, defesa, gols, infracoes, foto } = req.body

  try {
    const result = await pool.query(
      "UPDATE jogadores SET nome=$1, time=$2, vitorias=$3, empate=$4, defesa=$5, gols=$6, infracoes=$7, foto=$8 WHERE id=$9 RETURNING *",
      [nome, time, vitorias, empate, defesa, gols, infracoes, foto, id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Jogador não encontrado" })
    }
    res.json(result.rows[0])
  } catch (err) {
    console.error("Erro ao atualizar jogador:", err)
    res.status(500).json({ error: "Erro ao atualizar jogador" })
  }
})

/* ======================================================
   ENDPOINTS GOLEIROS (TABELA GOLEIROS)
====================================================== */

// Listar todos os goleiros
app.get("/goleiros", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM goleiros ORDER BY id DESC")
    res.json(result.rows)
  } catch (err) {
    console.error("Erro ao buscar goleiros:", err)
    res.status(500).json({ error: "Erro ao buscar goleiros" })
  }
})

// Buscar um goleiro específico por ID
app.get("/goleiros/:id", async (req, res) => {
  const { id } = req.params
  try {
    const result = await pool.query("SELECT * FROM goleiros WHERE id = $1", [id])
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Goleiro não encontrado" })
    }
    res.json(result.rows[0])
  } catch (err) {
    console.error("Erro ao buscar goleiro:", err)
    res.status(500).json({ error: "Erro ao buscar goleiro" })
  }
})

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("API FutPontos rodando na porta " + PORT);
});

// Criar novo goleiro
app.post("/goleiros", async (req, res) => {
  const { nome, time, vitorias, empate, defesa, gols, infracoes, foto } = req.body;

  try {
    const result = await pool.query(
      "INSERT INTO goleiros (nome, time, vitorias, empate, defesa, gols, infracoes, foto) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
      [nome, time, vitorias || 0, empate || 0, defesa || 0, gols || 0, infracoes || 0, foto]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao salvar goleiro:", err);
    res.status(500).json({ error: "Erro ao salvar goleiro" });
  }
});

// Atualizar goleiro existente
app.put("/goleiros/:id", async (req, res) => {
  const { id } = req.params;
  const { nome, time, vitorias, empate, defesa, gols, infracoes, foto } = req.body;

  try {
    const result = await pool.query(
      "UPDATE goleiros SET nome=$1, time=$2, vitorias=$3, empate=$4, defesa=$5, gols=$6, infracoes=$7, foto=$8 WHERE id=$9 RETURNING *",
      [nome, time, vitorias, empate, defesa, gols, infracoes, foto, id]
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

// Excluir goleiro
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

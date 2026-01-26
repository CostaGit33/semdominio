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

// Rota de verificação de saúde (Health Check)
app.get("/", (req, res) => {
  res.send("API semdominio ONLINE")
})

// Rota para ADICIONAR jogador (Atualizada com todos os campos)
app.post("/jogadores", async (req, res) => {
  const { nome, time, pontos, vitorias, gols, defesa, empate } = req.body

  try {
    const result = await pool.query(
      "INSERT INTO jogadores (nome, time, pontos, vitorias, gols, defesa, empate) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
      [
        nome, 
        time, 
        parseInt(pontos) || 0, 
        parseInt(vitorias) || 0, 
        parseInt(gols) || 0, 
        parseInt(defesa) || 0, 
        parseInt(empate) || 0
      ]
    )
    res.json(result.rows[0])
  } catch (err) {
    console.error("Erro ao salvar:", err)
    res.status(500).json({ error: "Erro ao salvar jogador no banco de dados" })
  }
})

// Rota para LISTAR todos os jogadores
app.get("/jogadores", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM jogadores ORDER BY id DESC")
    res.json(result.rows)
  } catch (err) {
    console.error("Erro ao buscar:", err)
    res.status(500).json({ error: "Erro ao buscar jogadores" })
  }
})

// Rota para DELETAR um jogador pelo ID
app.delete("/jogadores/:id", async (req, res) => {
  const { id } = req.params
  try {
    await pool.query("DELETE FROM jogadores WHERE id = $1", [id])
    res.json({ message: "Jogador removido com sucesso" })
  } catch (err) {
    console.error("Erro ao deletar:", err)
    res.status(500).json({ error: "Erro ao remover jogador" })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`)
})

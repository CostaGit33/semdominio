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

app.get("/", (req, res) => {
  res.send("API semdominio ONLINE")
})

app.post("/jogadores", async (req, res) => {
  const { nome, time, gols } = req.body

  try {
    const result = await pool.query(
      "INSERT INTO jogadores (nome, time, gols) VALUES ($1,$2,$3) RETURNING *",
      [nome, time, gols]
    )

    res.json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Erro ao salvar jogador" })
  }
})

app.get("/jogadores", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM jogadores ORDER BY id DESC")
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Erro ao buscar jogadores" })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log("API rodando na porta", PORT))

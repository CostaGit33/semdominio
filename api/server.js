require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();

/* ======================================================
   CONFIGURAÇÕES INICIAIS
====================================================== */
app.use(cors());
app.use(express.json());

// Configuração do Banco de Dados PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Necessário para serviços como Render, Railway ou Neon
  }
});

/* ======================================================
   ROTAS DA API
====================================================== */

// Rota de teste
app.get("/", (req, res) => {
  res.send("⚽ API Baba Sem Domínio ONLINE");
});

/**
 * ROTA: Cadastrar Jogador (POST /jogadores)
 * Recebe todos os campos da tabela SQL
 */
app.post("/jogadores", async (req, res) => {
  const { nome, vitorias, gols, defesa, empate, infracoes } = req.body;

  try {
    const query = `
      INSERT INTO jogadores (nome, vitorias, gols, defesa, empate, infracoes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    // Garante que se um valor não for enviado, ele seja salvo como 0
    const values = [
      nome,
      vitorias || 0,
      gols || 0,
      defesa || 0,
      empate || 0,
      infracoes || 0
    ];

    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao salvar jogador:", err);
    res.status(500).json({ error: "Erro interno ao salvar jogador" });
  }
});

/**
 * ROTA: Listagem Geral (GET /jogadores)
 * Usada pela página index.html
 */
app.get("/jogadores", async (req, res) => {
  try {
    // Retorna todos os jogadores para o frontend calcular a pontuação geral
    const result = await pool.query("SELECT * FROM jogadores ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    console.error("Erro ao buscar jogadores:", err);
    res.status(500).json({ error: "Erro ao buscar lista de jogadores" });
  }
});

/**
 * ROTA: Listagem de Goleiros (GET /jogadores2)
 * Usada pela página goleiros.html
 */
app.get("/jogadores2", async (req, res) => {
  try {
    // Filtra jogadores que têm pelo menos 1 defesa (critério para ser goleiro)
    const result = await pool.query(
      "SELECT * FROM jogadores WHERE defesa > 0 ORDER BY id DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Erro ao buscar goleiros:", err);
    res.status(500).json({ error: "Erro ao buscar lista de goleiros" });
  }
});

/**
 * ROTA: Detalhes de um Jogador (GET /jogadores/:id)
 * Útil para a página jogador.html?id=...
 */
app.get("/jogadores/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("SELECT * FROM jogadores WHERE id = $1", [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Jogador não encontrado" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao buscar detalhes do jogador:", err);
    res.status(500).json({ error: "Erro ao buscar detalhes" });
  }
});

/* ======================================================
   INICIALIZAÇÃO DO SERVIDOR
====================================================== */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`-----------------------------------------`);
  console.log(`🚀 Servidor a correr na porta ${PORT}`);
  console.log(`🔗 Geral: http://localhost:${PORT}/jogadores`);
  console.log(`🔗 Goleiros: http://localhost:${PORT}/jogadores2`);
  console.log(`-----------------------------------------`);
});

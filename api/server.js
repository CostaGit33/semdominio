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

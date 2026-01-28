// js/classificacao.js
// Classificação conectada à API (PostgreSQL)

document.addEventListener("DOMContentLoaded", () => {
  const playerListContainer = document.getElementById("playerList");

  if (!playerListContainer) return;

  const API_URL = "https://api.semdominio.online/jogadores";

  // ============================
  // BUSCAR E RENDERIZAR JOGADORES
  // ============================
  async function renderPlayers() {
    try {
      const res = await fetch(API_URL);

      if (!res.ok) {
        throw new Error("Erro ao buscar dados da API");
      }

      const players = await res.json();

      // Ordena por pontos (maior → menor)
      players.sort((a, b) => b.pontos - a.pontos);

      playerListContainer.innerHTML = "";

      if (players.length === 0) {
        playerListContainer.innerHTML = `
          <tr>
            <td colspan="7" class="empty-message">
              Nenhum jogador cadastrado.
            </td>
          </tr>`;
        return;
      }

      players.forEach((player) => {
        const row = document.createElement("tr");
        row.dataset.id = player.id;

        row.innerHTML = `
          <td>${player.nome}</td>
          <td>${player.pontos}</td>
          <td>${player.vitorias}</td>
          <td>${player.gols}</td>
          <td>${player.defesa}</td>
          <td>${player.empate}</td>
          <td class="actions">
            <button class="edit-btn">✏️</button>
            <button class="delete-btn">🗑️</button>
          </td>
        `;

        playerListContainer.appendChild(row);
      });

    } catch (error) {
      console.error("Erro ao carregar classificação:", error);
      playerListContainer.innerHTML = `
        <tr>
          <td colspan="7">Erro ao carregar dados.</td>
        </tr>`;
    }
  }

  // ============================
  // EVENTOS (edição futura)
  // ============================
  playerListContainer.addEventListener("click", (event) => {
    const target = event.target;
    const row = target.closest("tr");
    if (!row) return;

    const playerId = row.dataset.id;

    if (target.classList.contains("edit-btn")) {
      alert("Edição via API será o próximo passo 😉\nID do jogador: " + playerId);
    }

    if (target.classList.contains("delete-btn")) {
      alert("Delete via API será o próximo passo 😉\nID do jogador: " + playerId);
    }
  });

  // ============================
  // INICIALIZA
  // ============================
  renderPlayers();
});

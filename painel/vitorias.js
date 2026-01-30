// assets/js/vitorias.js

const API_URL = "https://api.semdominio.online/jogadores";

document.addEventListener("DOMContentLoaded", carregarVitorias);

async function carregarVitorias() {
  const tbody = document.getElementById("playerList");
  if (!tbody) return;

  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error("Erro ao buscar jogadores");

    let jogadores = await res.json();

    // Ordena por vitórias (maior → menor)
    jogadores.sort((a, b) => b.vitorias - a.vitorias);

    tbody.innerHTML = "";

    if (jogadores.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3">Nenhum jogador cadastrado.</td></tr>`;
      return;
    }

    jogadores.forEach((jogador, index) => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${index + 1}º - ${jogador.nome}</td>
        <td>${jogador.vitorias}</td>
        <td>—</td>
      `;

      tbody.appendChild(tr);
    });

  } catch (error) {
    console.error(error);
    tbody.innerHTML = `<tr><td colspan="3">Erro ao carregar ranking de vitórias.</td></tr>`;
  }
}

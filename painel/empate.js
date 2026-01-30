// assets/js/empate.js

const API_URL = "https://api.semdominio.online/jogadores";

document.addEventListener("DOMContentLoaded", carregarEmpates);

async function carregarEmpates() {
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error("Erro ao buscar jogadores");

    let jogadores = await res.json();

    // Ordena por empates (decrescente)
    jogadores.sort((a, b) => b.empate - a.empate);

    const tbody = document.getElementById("playerList");
    tbody.innerHTML = "";

    jogadores.forEach((jogador, index) => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${index + 1}º - ${jogador.nome}</td>
        <td>${jogador.empate}</td>
        <td>—</td>
      `;

      tbody.appendChild(tr);
    });

  } catch (error) {
    console.error(error);
    document.getElementById("playerList").innerHTML =
      `<tr><td colspan="3">Erro ao carregar ranking de empates</td></tr>`;
  }
}

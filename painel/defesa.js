// assets/js/defesa.js

const API_URL = "https://api.semdominio.online/jogadores";

document.addEventListener("DOMContentLoaded", carregarDefesas);

async function carregarDefesas() {
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error("Erro ao buscar dados");

    let jogadores = await res.json();

    // Ordena por defesas (decrescente)
    jogadores.sort((a, b) => b.defesa - a.defesa);

    const tbody = document.getElementById("playerList");
    tbody.innerHTML = "";

    jogadores.forEach((jogador, index) => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${index + 1}º - ${jogador.nome}</td>
        <td>${jogador.defesa}</td>
        <td>—</td>
      `;

      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error(err);
    document.getElementById("playerList").innerHTML =
      `<tr><td colspan="3">Erro ao carregar dados</td></tr>`;
  }
}

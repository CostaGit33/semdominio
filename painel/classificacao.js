import { calculatePoints } from "./globais.js";

const API_URL = "https://api.semdominio.online/jogadores";

document.addEventListener("DOMContentLoaded", () => {
  carregarClassificacao();
  setInterval(carregarClassificacao, 10000); // ranking vivo (10s)
});

async function carregarClassificacao() {
  const cardsContainer = document.getElementById("rankingCards");
  const tbody = document.getElementById("playerList"); // mantém compatível se ainda existir

  if (!cardsContainer && !tbody) return;

  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error("Erro ao buscar jogadores");

    let jogadores = await res.json();

    // Garante pontos corretos
    jogadores.forEach(j => {
      j.pontos = calculatePoints(
        j.vitorias || 0,
        j.empate || 0,
        j.defesa || 0,
        j.gols || 0,
        j.infracoes || 0
      );
    });

    // Ordena por pontos
    jogadores.sort((a, b) => b.pontos - a.pontos);

    if (cardsContainer) renderCards(jogadores, cardsContainer);
    if (tbody) renderTable(jogadores, tbody);

  } catch (err) {
    console.error(err);

    if (tbody) {
      tbody.innerHTML = `
        <tr><td colspan="7">Erro ao carregar classificação.</td></tr>
      `;
    }
  }
}

/* =========================
   RENDER CARDS (UI MODERNA)
========================= */

function renderCards(jogadores, container) {
  container.innerHTML = "";

  if (jogadores.length === 0) {
    container.innerHTML = "<p>Nenhum jogador cadastrado.</p>";
    return;
  }

  const maxPoints = jogadores[0].pontos || 1;

  jogadores.forEach((j, index) => {
    const percent = (j.pontos / maxPoints) * 100;

    const card = document.createElement("div");
    card.className = "player-card";
    card.style.animationDelay = `${index * 0.05}s`;

    card.innerHTML = `
      <div class="player-rank">#${index + 1}</div>

      <div class="player-name">${j.nome}</div>
      <div class="player-points">${j.pontos} pts</div>

      <div class="progress-bar">
        <div class="progress-fill"></div>
      </div>

      <div class="player-stats">
        <span>🏆 ${j.vitorias}</span>
        <span>⚽ ${j.gols}</span>
        <span>🧤 ${j.defesa}</span>
        <span>🤝 ${j.empate}</span>
      </div>
    `;

    container.appendChild(card);

    // anima a barra depois de renderizar
    requestAnimationFrame(() => {
      card.querySelector(".progress-fill").style.width = percent + "%";
    });
  });
}

/* =========================
   RENDER TABELA (SE EXISTIR)
========================= */

function renderTable(jogadores, tbody) {
  tbody.innerHTML = "";

  if (jogadores.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7">Nenhum jogador cadastrado.</td></tr>`;
    return;
  }

  jogadores.forEach((jogador, index) => {
    const tr = document.createElement("tr");

    tr.style.animation = "fadeUp .4s ease both";
    tr.style.animationDelay = `${index * 0.03}s`;

    tr.innerHTML = `
      <td>${index + 1}º - ${jogador.nome}</td>
      <td>${jogador.pontos}</td>
      <td>${jogador.vitorias}</td>
      <td>${jogador.gols}</td>
      <td>${jogador.defesa}</td>
      <td>${jogador.empate}</td>
      <td><button class="edit-btn">✏️</button></td>
    `;

    tbody.appendChild(tr);
  });
}

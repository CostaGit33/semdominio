const API_URL = "https://api.semdominio.online/jogadores";
const content = document.getElementById("profileContent");

const fields = [
  ["vitorias", "Vitórias"],
  ["gols", "Gols"],
  ["defesa", "Defesas"],
  ["empate", "Empates"],
  ["infracoes", "Infrações"]
];

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char]);
}

function photoMarkup(player) {
  const photo = String(player.foto || "").trim();
  if (photo && photo !== "0") {
    return `<img class="profile-photo" src="${escapeHtml(photo)}" alt="Foto de ${escapeHtml(player.nome)}" onerror="this.classList.add('placeholder');this.src='assets/img/futponts_large.png'">`;
  }
  return `<img class="profile-photo placeholder" src="assets/img/futponts_large.png" alt="Sem foto de ${escapeHtml(player.nome)}">`;
}

function renderProfile(player) {
  const stats = fields.map(([key, label]) => ({ key, label, value: safeNumber(player[key]) }));
  const max = Math.max(1, ...stats.map(stat => stat.value));
  content.innerHTML = `
    <section class="profile-hero">
      ${photoMarkup(player)}
      <div>
        <p class="profile-kicker">JOGADOR #${escapeHtml(player.id)}</p>
        <h1 class="profile-name">${escapeHtml(player.nome)}</h1>
        <p class="profile-id">Perfil oficial do FutPontos</p>
      </div>
      <div class="score-box"><span class="score-label">PONTOS</span><strong class="score-value">${safeNumber(player.pontos)}</strong></div>
    </section>
    <section class="stats-section">
      <h2>Estatísticas</h2>
      <div class="stats-grid">
        ${stats.map((stat, index) => `<article class="stat-card ${index === 0 ? 'highlight' : ''}"><span class="stat-value">${stat.value}</span><span class="stat-label">${stat.label}</span></article>`).join("")}
      </div>
    </section>
    <section class="performance-card">
      <h2>Desempenho</h2>
      ${stats.map(stat => `<div class="bar-row"><span class="bar-label">${stat.label}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.round((stat.value / max) * 100)}%"></span></span><span class="bar-value">${stat.value}</span></div>`).join("")}
    </section>
    <div class="profile-actions"><a href="classificacao.html">Voltar para a classificação</a></div>`;
}

async function loadProfile() {
  const id = new URLSearchParams(window.location.search).get("id");
  if (!id || !/^\d+$/.test(id)) {
    content.innerHTML = `<div class="profile-error">Jogador não informado. <a href="classificacao.html">Voltar à classificação</a></div>`;
    return;
  }
  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error("Não foi possível carregar os jogadores.");
    const players = await response.json();
    const player = players.find(item => String(item.id) === id);
    if (!player) throw new Error("Jogador não encontrado.");
    document.title = `${player.nome} | FutPontos`;
    renderProfile(player);
  } catch (error) {
    console.error(error);
    content.innerHTML = `<div class="profile-error">${escapeHtml(error.message)} <a href="classificacao.html">Voltar à classificação</a></div>`;
  }
}

loadProfile();

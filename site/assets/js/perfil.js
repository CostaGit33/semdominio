const API_PLAYERS = "https://api.semdominio.online/jogadores";
const API_PERFORMANCE = "https://api.semdominio.online/desempenho";
const content = document.getElementById("profileContent");

const statFields = [
  ["pontos", "Pontos"], ["gols", "Gols"], ["defesa", "Defesas"],
  ["vitorias", "Vitórias"], ["empate", "Empates"], ["infracoes", "Infrações"]
];

function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.max(0, parsed) : 0; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
function photo(player, className = "player-photo") {
  const src = String(player.foto || "").trim() || "assets/img/futponts_large.png";
  return `<img class="${className}" src="${escapeHtml(src)}" alt="Foto de ${escapeHtml(player.nome)}" onerror="this.src='assets/img/futponts_large.png';this.classList.add('photo-fallback')">`;
}
function performanceFor(player, performance) { return performance.find(item => String(item.id) === String(player.id)) || player; }

function renderPlayerList(players) {
  const sorted = [...players].sort((a, b) => number(b.pontos) - number(a.pontos));
  content.innerHTML = `<section class="players-intro"><p class="eyebrow">FUTPONTOS / PLANTEL</p><h2>Perfis dos jogadores</h2><p>Consulte os dados disponíveis de cada jogador em uma visão completa de desempenho.</p><div class="profile-tabs"><button class="active" data-sort="pontos">Ranking geral</button><button data-sort="gols">Marcadores</button><button data-sort="defesa">Defesas</button><button data-sort="vitorias">Vitórias</button></div></section><section class="players-list" id="playersList"></section>`;
  const list = document.getElementById("playersList");
  const draw = (key = "pontos") => {
    const ordered = [...players].sort((a, b) => number(b[key]) - number(a[key]));
    list.innerHTML = ordered.map((player, index) => `<a class="player-row" href="perfil.html?id=${encodeURIComponent(player.id)}"><span class="player-rank">${index + 1}</span>${photo(player)}<span class="player-copy"><strong>${escapeHtml(player.nome)}</strong><small>Jogador #${escapeHtml(player.id)} · ${number(player.pontos)} pontos</small></span><span class="player-score"><strong>${number(player[key])}</strong><small>${key === "pontos" ? "PONTOS" : key.toUpperCase()}</small></span><span class="row-chevron">›</span></a>`).join("") || `<div class="empty-state">Nenhum jogador encontrado.</div>`;
    document.querySelectorAll(".profile-tabs button").forEach(button => button.classList.toggle("active", button.dataset.sort === key));
  };
  document.querySelectorAll(".profile-tabs button").forEach(button => button.addEventListener("click", () => draw(button.dataset.sort)));
  draw();
}

function renderDetail(player, performance) {
  const technical = performanceFor(player, performance).avaliacao || {};
  const stats = statFields.map(([key, label]) => ({ key, label, value: number(player[key]) }));
  const technicalEntries = [["ataque", "Ataque"], ["defesa", "Defesa"], ["velocidade", "Velocidade"], ["habilidade", "Habilidade"], ["passe", "Passe"]].filter(([key]) => technical[key] !== null && technical[key] !== undefined);
  const max = Math.max(1, ...stats.map(item => item.value));
  document.title = `${player.nome} | FutPontos`;
  content.innerHTML = `<section class="player-hero">${photo(player, "hero-photo")}<div class="hero-copy"><p class="eyebrow">PERFIL DO JOGADOR / #${escapeHtml(player.id)}</p><h2>${escapeHtml(player.nome)}</h2><p class="hero-subtitle">Dados oficiais do FutPontos</p><div class="hero-actions"><a class="primary-action" href="perfil.html">← Todos os jogadores</a><button class="secondary-action" id="shareProfile">Compartilhar</button></div></div><div class="hero-points"><span>PONTOS</span><strong>${number(player.pontos)}</strong></div></section><nav class="detail-tabs" aria-label="Seções do perfil"><a class="active" href="#visao-geral">Visão geral</a><a href="#estatisticas">Estatísticas</a><a href="#ranking">Ranking</a></nav><section class="profile-section" id="visao-geral"><div class="section-title"><div><p class="eyebrow">VISÃO GERAL</p><h3>Resumo do jogador</h3></div></div><div class="stat-grid">${stats.map(item => `<article class="profile-stat ${item.key === "pontos" ? "featured" : ""}"><strong>${item.value}</strong><span>${item.label}</span></article>`).join("")}</div></section><section class="profile-section two-columns" id="estatisticas"><div class="data-card"><p class="eyebrow">DESEMPENHO ACUMULADO</p><h3>Indicadores da temporada</h3><div class="metric-bars">${stats.map(item => `<div class="metric-row"><div><span>${item.label}</span><strong>${item.value}</strong></div><div class="metric-track"><i style="width:${Math.round((item.value / max) * 100)}%"></i></div></div>`).join("")}</div></div><div class="data-card technical-card"><p class="eyebrow">AVALIAÇÃO TÉCNICA</p><h3>Perfil de jogo</h3>${technicalEntries.length ? technicalEntries.map(([key, label]) => `<div class="technical-row"><span>${label}</span><strong>${number(technical[key])}</strong><div><i style="width:${Math.min(100, number(technical[key]))}%"></i></div></div>`).join("") : `<div class="empty-technical">Nenhuma avaliação técnica disponível para este jogador.</div>`}</div></section><section class="profile-section ranking-section" id="ranking"><div><p class="eyebrow">LEITURA RÁPIDA</p><h3>Resumo do perfil</h3><p>Este perfil usa exclusivamente os dados retornados pela API FutPontos. Informações que ainda não existem na API não são inventadas.</p></div><a href="classificacao.html" class="secondary-action">Ver classificação →</a></section>`;
  document.getElementById("shareProfile")?.addEventListener("click", async () => { try { await navigator.clipboard.writeText(window.location.href); document.getElementById("shareProfile").textContent = "Link copiado"; } catch { document.getElementById("shareProfile").textContent = "Copie o endereço"; } });
}

async function load() {
  try {
    const [playersResponse, performanceResponse] = await Promise.all([fetch(API_PLAYERS), fetch(API_PERFORMANCE)]);
    if (!playersResponse.ok) throw new Error("Não foi possível carregar os jogadores.");
    const players = await playersResponse.json();
    const performance = performanceResponse.ok ? await performanceResponse.json() : [];
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) {
      const player = players.find(item => String(item.id) === id);
      if (!player) throw new Error("Jogador não encontrado.");
      renderDetail(player, performance);
    } else renderPlayerList(players);
  } catch (error) {
    content.innerHTML = `<div class="profile-error">${escapeHtml(error.message)}<br><a href="perfil.html">Tentar novamente</a></div>`;
  }
}
load();

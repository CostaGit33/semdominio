import { apiRequest, showFeedback } from "./globais.js";

const TEAM_COLORS = ["#ff4d5a", "#5ea7ff", "#00ff88", "#ffd166", "#b77bff"];
const MAX_PLAYERS_PER_TEAM = 7;
const EXCLUDED_IDS = new Set([31, 47]);
const TECH_KEYS = [
  ["defesa", "Def", "Defesa"],
  ["ataque", "Atq", "Ataque"],
  ["velocidade", "Vel", "Velocidade"],
  ["habilidade", "Hab", "Habilidade"],
  ["passe", "Pas", "Passe"]
];

let jogadores = [];
let teams = Array.from({ length: 5 }, () => []);
let teamCount = 5;

const $ = (id) => document.getElementById(id);
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

function normalizeName(name = "") {
  return String(name).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function initial(name = "?") {
  return String(name).trim().charAt(0).toUpperCase() || "?";
}

function getEvaluation(raw) {
  return raw?.avaliacao || null;
}

function technicalTotal(player) {
  return TECH_KEYS.reduce((sum, [key]) => sum + number(player.avaliacao?.[key]), 0);
}

function technicalAverage(player) {
  if (!player.avaliacao) return null;
  const values = TECH_KEYS.map(([key]) => player.avaliacao[key]).filter((value) => value !== null && value !== undefined && value !== "");
  return values.length ? values.reduce((a, b) => a + number(b), 0) / values.length : null;
}

function mergePlayers(classification, performance) {
  const byId = new Map(performance.map((p) => [Number(p.id), p]));

  return classification
    .filter((p) => !EXCLUDED_IDS.has(Number(p.id)))
    .map((p) => {
      const perf = byId.get(Number(p.id));
      return {
        ...p,
        id: Number(p.id),
        nome: p.nome || perf?.nome || "Sem nome",
        avaliacao: getEvaluation(perf),
        mediaTecnica: technicalAverage(perf),
        totalTecnico: technicalTotal(perf),
        possuiAvaliacao: Boolean(perf?.avaliacao)
      };
    });
}

function selectedTeamIndex(id) {
  return teams.findIndex((team) => team.some((p) => p.id === id));
}

function selectedCount() {
  return teams.slice(0, teamCount).reduce((sum, team) => sum + team.length, 0);
}

function getSortedPlayers() {
  const query = $("searchPlayer").value.trim().toLowerCase();
  const sort = $("sortPlayers").value;

  return jogadores
    .filter((p) => p.nome.toLowerCase().includes(query))
    .sort((a, b) => {
      if (sort === "nome") return a.nome.localeCompare(b.nome, "pt-BR");
      if (sort === "pontos") return number(b.pontos) - number(a.pontos) || a.nome.localeCompare(b.nome, "pt-BR");
      if (sort === "totalTec") return number(b.totalTecnico) - number(a.totalTecnico) || number(b.pontos) - number(a.pontos);
      return number(b.mediaTecnica) - number(a.mediaTecnica) || number(b.pontos) - number(a.pontos) || a.nome.localeCompare(b.nome, "pt-BR");
    });
}

function movePlayer(id, targetTeam) {
  const player = jogadores.find((p) => p.id === id);
  if (!player || targetTeam < 0 || targetTeam >= teamCount) return;

  const currentTeam = selectedTeamIndex(id);
  if (currentTeam === targetTeam) return;

  if (teams[targetTeam].length >= MAX_PLAYERS_PER_TEAM) {
    showFeedback(`Time ${targetTeam + 1} já tem 7 jogadores.`, "error");
    return;
  }

  if (currentTeam >= 0) teams[currentTeam] = teams[currentTeam].filter((p) => p.id !== id);
  teams[targetTeam].push(player);
  render();
}

function removePlayer(id) {
  teams = teams.map((team) => team.filter((p) => p.id !== id));
  render();
}

function changeTeamCount() {
  const next = Number($("teamCount").value);
  if (next >= teamCount) {
    teamCount = next;
    render();
    return;
  }

  const displaced = teams.slice(next).flat();
  teams = teams.slice(0, next);
  while (teams.length < 5) teams.push([]);
  teamCount = next;

  if (displaced.length) showFeedback(`${displaced.length} jogador(es) voltou(aram) para a lista de disponíveis.`, "success");
  render();
}

function clearAll() {
  teams = Array.from({ length: 5 }, () => []);
  render();
}

function renderPlayerCard(player) {
  const selected = selectedTeamIndex(player.id);
  const avg = player.mediaTecnica === null ? "—" : player.mediaTecnica.toFixed(1);
  const techValues = TECH_KEYS.map(([key, short]) => {
    const value = player.avaliacao ? number(player.avaliacao[key]) : 0;
    return `<div class="tech-item"><label>${short} ${player.avaliacao ? value : "—"}</label><div class="tech-bar"><i style="width:${Math.min(100, value / 20 * 100)}%"></i></div></div>`;
  }).join("");

  const buttons = Array.from({ length: teamCount }, (_, i) => `
    <button class="${selected === i ? "active" : ""}" data-team="${i}" data-player="${player.id}" ${teams[i].length >= MAX_PLAYERS_PER_TEAM && selected !== i ? "disabled" : ""}>T${i + 1}</button>
  `).join("");

  return `
    <article class="player-select-card ${selected >= 0 ? "selected" : ""}">
      <div class="player-top">
        <div class="avatar">${initial(player.nome)}</div>
        <div class="player-name"><strong>${escapeHtml(player.nome)}</strong><small>${selected >= 0 ? `Selecionado • Time ${selected + 1}` : "Disponível para escolha"}</small></div>
        <div class="average-mini"><small>MÉDIA TÉCNICA</small>${avg}</div>
      </div>
      <div class="mini-metrics">
        <div class="mini-metric"><span>Pontos</span><b>${number(player.pontos)}</b></div>
        <div class="mini-metric"><span>Vitórias</span><b>${number(player.vitorias)}</b></div>
        <div class="mini-metric"><span>Gols</span><b>${number(player.gols)}</b></div>
        <div class="mini-metric"><span>Defesas</span><b>${number(player.defesa)}</b></div>
      </div>
      <div class="tech-strip">${techValues}</div>
      <div class="team-actions">${buttons}</div>
    </article>
  `;
}

function teamStats(team) {
  const avg = team.length ? team.reduce((sum, p) => sum + number(p.mediaTecnica), 0) / team.length : 0;
  return {
    points: team.reduce((sum, p) => sum + number(p.pontos), 0),
    tech: team.reduce((sum, p) => sum + number(p.totalTecnico), 0),
    avg
  };
}

function renderTeamCard(team, index) {
  const stats = teamStats(team);
  const members = team.length
    ? team.map((p) => `
      <div class="selected-member">
        <div class="avatar">${initial(p.nome)}</div>
        <div class="member-main"><strong>${escapeHtml(p.nome)}</strong><small>${number(p.pontos)} pts • técnica ${p.mediaTecnica === null ? "—" : p.mediaTecnica.toFixed(1)}</small></div>
        <span class="member-avg">${p.mediaTecnica === null ? "—" : p.mediaTecnica.toFixed(1)}</span>
        <button class="remove-player" data-remove="${p.id}" aria-label="Remover ${escapeHtml(p.nome)}">×</button>
      </div>
    `).join("")
    : `<div class="empty-team">Nenhum jogador escolhido.<br><span>Selecione um jogador e toque em T${index + 1}.</span></div>`;

  return `
    <article class="team-card" style="--team:${TEAM_COLORS[index]}">
      <div class="team-card-head">
        <div><h4>TIME ${index + 1}</h4><small>${team.length}/${MAX_PLAYERS_PER_TEAM} jogadores</small></div>
        <div class="team-strength"><small>FORÇA TÉCNICA</small>${stats.tech}</div>
      </div>
      <div class="team-members">${members}</div>
      <div class="team-summary">
        <div><span>Pontos</span><b>${stats.points}</b></div>
        <div><span>Média técnica</span><b>${team.length ? stats.avg.toFixed(1) : "—"}</b></div>
        <div><span>Vagas</span><b>${MAX_PLAYERS_PER_TEAM - team.length}</b></div>
      </div>
    </article>
  `;
}

function render() {
  const visiblePlayers = getSortedPlayers();
  const available = jogadores.filter((p) => selectedTeamIndex(p.id) < 0).length;
  const selected = selectedCount();

  $("playersList").innerHTML = visiblePlayers.length
    ? visiblePlayers.map(renderPlayerCard).join("")
    : `<div class="empty-team">Nenhum jogador encontrado.</div>`;

  $("teamsGrid").innerHTML = teams.slice(0, teamCount).map(renderTeamCard).join("");
  $("availableCount").textContent = `${available} disponíveis`;
  $("selectedCount").textContent = selected;
  $("progressValue").textContent = selected;
  $("maxPlayers").textContent = teamCount * MAX_PLAYERS_PER_TEAM;

  document.querySelectorAll("[data-team]").forEach((button) => {
    button.addEventListener("click", () => movePlayer(Number(button.dataset.player), Number(button.dataset.team)));
  });
  document.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => removePlayer(Number(button.dataset.remove)));
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

async function load() {
  try {
    $("pageStatus").textContent = "Consultando classificação e avaliação técnica...";
    const [classification, performance] = await Promise.all([
      apiRequest("/jogadores"),
      apiRequest("/desempenho")
    ]);

    jogadores = mergePlayers(classification, performance);
    $("pageStatus").textContent = `${jogadores.length} jogadores disponíveis. Dados de classificação e avaliação técnica integrados pelo ID do jogador.`;
    render();
  } catch (error) {
    console.error(error);
    $("pageStatus").textContent = "Não foi possível carregar os jogadores. Verifique a API.";
    showFeedback(error.message || "Erro ao carregar jogadores", "error");
  }
}

$("teamCount").addEventListener("change", changeTeamCount);
$("searchPlayer").addEventListener("input", render);
$("sortPlayers").addEventListener("change", render);
$("clearAll").addEventListener("click", clearAll);

load();

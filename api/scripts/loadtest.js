#!/usr/bin/env node
"use strict";

/*
 * Teste de carga da API FutPontos — SOMENTE LEITURA (só faz GET).
 * Node >= 18, sem dependências: roda no console do container da API ou na sua máquina.
 *
 *   node scripts/loadtest.js                    100 usuários (~4 min) em http://127.0.0.1:$PORT
 *   SMOKE=1 node scripts/loadtest.js            verificação rápida: 5 usuários, ~20 s
 *   BASE_URL=https://api.semdominio.online node scripts/loadtest.js
 *   THINK=0 USERS=50 node scripts/loadtest.js   estresse: sem pausa entre telas, procura o teto de req/s
 *
 * Variáveis (todas opcionais):
 *   BASE_URL    alvo (padrão http://127.0.0.1:$PORT, ou :3000)
 *   USERS       usuários simultâneos no platô (100; máximo 1000)
 *   RAMP        segundos para subir de 0 até USERS (60)
 *   HOLD        segundos mantendo USERS (180)
 *   THINK       pausa entre telas, em segundos: "1-3" ou "0" (padrão 1-3)
 *   IMAGES      fotos legadas (/uploads/) baixadas a cada abertura do app (5; 0 desliga)
 *   P95_MS      limite de aprovação do p95 no platô (800)
 *   ERR_PCT     limite de erros no platô, em % (1)
 *   TIMEOUT_MS  tempo máximo por requisição (15000)
 *   RAW_OUT     caminho de um .json para salvar todas as medições
 *
 * Nunca chama rotas de escrita (partida/registrar, fotos, admin).
 * Também não baixa fotos do R2: elas saem do Worker, que não é o alvo deste teste
 * e tem limite diário de requisições no plano gratuito.
 * Ctrl+C encerra e imprime o resumo do que já foi medido.
 */

const env = process.env;

function num(name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function parseThink(raw) {
  const [min, max = min] = String(raw || "1-3").trim().split("-").map(Number);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) return [1, 3];
  return [min, max];
}

const SMOKE = env.SMOKE === "1";
const BASE = (env.BASE_URL || `http://127.0.0.1:${env.PORT || 3000}`).replace(/\/+$/, "");
const USERS = SMOKE ? 5 : Math.floor(num("USERS", 100));
const RAMP = SMOKE ? 5 : num("RAMP", 60);
const HOLD = SMOKE ? 15 : num("HOLD", 180);
const IMAGES = Math.floor(num("IMAGES", 5));
const P95_LIMIT = num("P95_MS", 800);
const ERR_LIMIT = num("ERR_PCT", 1);
const TIMEOUT = num("TIMEOUT_MS", 15000) || 15000;
const RAW_OUT = env.RAW_OUT || "";
const [THINK_MIN, THINK_MAX] = parseThink(env.THINK);
const HEADERS = { "User-Agent": "futpontos-loadtest/1.0", Accept: "*/*" };

if (typeof fetch !== "function") {
  console.error("Este teste precisa de Node 18 ou superior (fetch nativo).");
  process.exit(2);
}
try { new URL(BASE); } catch {
  console.error(`BASE_URL inválida: ${BASE}`);
  process.exit(2);
}
if (USERS < 1 || USERS > 1000) {
  console.error("USERS deve estar entre 1 e 1000.");
  process.exit(2);
}

// ---------- medições ----------
const newAgg = () => ({ n: 0, err: 0, lat: [] });
const all = newAgg();          // rampa + platô
const plateau = newAgg();      // só quando todos os usuários já subiram
let windowAgg = newAgg();      // últimos ~10 s, para a tabela de andamento
const routes = new Map();      // rota -> { all, plateau }
const labels = new Map();      // status HTTP / tipo de falha -> contagem
const raw = [];
let startedAt = 0;
let rampEnd = 0;
let endAt = 0;
let lastReport = 0;
let active = 0;
let peakActive = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
const think = () => sleep(Math.min((THINK_MIN + Math.random() * (THINK_MAX - THINK_MIN)) * 1000, endAt - Date.now()));

function sample(list, count) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

function add(agg, ms, ok) {
  agg.n++;
  if (!ok) agg.err++;
  agg.lat.push(ms);
}

function record(route, ms, label, ok) {
  const now = Date.now();
  const inPlateau = now >= rampEnd;
  add(all, ms, ok);
  add(windowAgg, ms, ok);
  if (inPlateau) add(plateau, ms, ok);
  let entry = routes.get(route);
  if (!entry) routes.set(route, (entry = { all: newAgg(), plateau: newAgg() }));
  add(entry.all, ms, ok);
  if (inPlateau) add(entry.plateau, ms, ok);
  labels.set(label, (labels.get(label) || 0) + 1);
  if (RAW_OUT) raw.push([(now - startedAt) / 1000, route, label, ms]);
}

// percentil pelo método "nearest-rank" sobre lista ordenada
function pct(sorted, p) {
  if (!sorted.length) return NaN;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}
const ms = (v) => (Number.isFinite(v) ? (v < 10 ? v.toFixed(1) : String(Math.round(v))) : "-");
const byNumber = (a, b) => a - b;

// ---------- requisições ----------
async function req(route, path, wantJson) {
  const t0 = performance.now();
  let label;
  let ok = false;
  let body = null;
  let broken = false;
  try {
    const res = await fetch(BASE + path, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT) });
    label = String(res.status);
    ok = res.status >= 200 && res.status < 300;
    if (wantJson && ok) body = await res.json();
    else await res.arrayBuffer(); // consome o corpo: a medição inclui o download completo
  } catch (err) {
    broken = true;
    ok = false;
    label = err && err.name === "TimeoutError"
      ? "TIMEOUT"
      : `ERR:${(err && err.cause && err.cause.code) || (err && err.name) || "desconhecido"}`;
  }
  record(route, performance.now() - t0, label, ok);
  if (broken) await sleep(250); // evita laço quente se a API cair
  return body;
}

// ---------- o que um usuário faz ----------
const data = { ids: [], images: [] };

function learn(list) {
  if (!Array.isArray(list)) return;
  const ids = [];
  const images = [];
  for (const item of list) {
    if (!item || item.id == null) continue;
    ids.push(item.id);
    const foto = typeof item.foto === "string" ? item.foto : "";
    const at = foto.indexOf("/uploads/"); // só fotos legadas, servidas pela própria API
    if (at >= 0) images.push(foto.slice(at));
  }
  if (ids.length) data.ids = ids;
  data.images = images;
}

async function journey() {
  const stopped = () => Date.now() >= endAt;

  // 1) abre o app: ranking, competência atual e algumas fotos
  learn(await req("/jogadores", "/jogadores", true));
  await req("/competencias/atual", "/competencias/atual");
  if (IMAGES > 0 && data.images.length) {
    await Promise.all(sample(data.images, IMAGES).map((path) => req("/uploads/* (foto legada)", path)));
  }
  await think();
  if (stopped()) return;

  // 2) abre um jogador
  const id = data.ids.length ? data.ids[Math.floor(Math.random() * data.ids.length)] : 1;
  await req("/jogadores/:id", `/jogadores/${id}`);
  await think();
  if (stopped()) return;

  // 3) outras abas
  await req("/desempenho", "/desempenho");
  await req("/goleiros/ranking", "/goleiros/ranking");
  if (Math.random() < 0.3) await req("/goleiros", "/goleiros");
  if (Math.random() < 0.1) await req("/health", "/health");
  await think();
}

async function user(index) {
  await sleep(startedAt + (index / USERS) * RAMP * 1000 - Date.now()); // sobe em rampa linear
  if (Date.now() >= endAt) return;
  active++;
  peakActive = Math.max(peakActive, active);
  try {
    while (Date.now() < endAt) await journey();
  } finally {
    active--;
  }
}

// ---------- relatório ----------
function reportWindow() {
  const w = windowAgg;
  windowAgg = newAgg();
  const now = Date.now();
  const seconds = Math.max(0.001, (now - lastReport) / 1000);
  lastReport = now;
  const sorted = w.lat.slice().sort(byNumber);
  console.log([
    `${Math.round((now - startedAt) / 1000)} s`.padStart(7),
    String(active).padStart(9),
    (w.n / seconds).toFixed(1).padStart(8),
    ms(pct(sorted, 50)).padStart(9),
    ms(pct(sorted, 95)).padStart(9),
    String(w.err).padStart(7),
  ].join("  "));
}

function summary() {
  const usePlateau = plateau.n > 0;
  const S = usePlateau ? plateau : all;
  const seconds = usePlateau
    ? Math.max(0.001, (Math.min(Date.now(), endAt) - rampEnd) / 1000)
    : Math.max(0.001, (Date.now() - startedAt) / 1000);
  const sorted = S.lat.slice().sort(byNumber);
  const p95 = pct(sorted, 95);
  const errPct = S.n ? (S.err / S.n) * 100 : 0;

  console.log(`\n=== Resumo (${usePlateau ? `platô: ${USERS} usuários` : "teste interrompido antes do platô"}, ${seconds.toFixed(0)} s) ===`);
  console.log(`requisições: ${S.n} · ${(S.n / seconds).toFixed(1)} req/s · erros: ${S.err} (${errPct.toFixed(2)}%)`);
  console.log(`latência (ms): p50 ${ms(pct(sorted, 50))} · p90 ${ms(pct(sorted, 90))} · p95 ${ms(p95)} · p99 ${ms(pct(sorted, 99))} · máx ${ms(sorted[sorted.length - 1])}`);
  console.log(`total medido (rampa + platô): ${all.n} requisições · pico de usuários simultâneos: ${peakActive}`);
  console.log(`status: ${[...labels.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(", ")}`);

  const rows = [...routes.entries()]
    .map(([route, e]) => [route, usePlateau ? e.plateau : e.all])
    .filter(([, agg]) => agg.n > 0)
    .sort((a, b) => b[1].n - a[1].n);
  const width = Math.max(5, ...rows.map(([route]) => route.length));
  console.log(`\n${"rota".padEnd(width)}  ${"req".padStart(7)}  ${"erros".padStart(6)}  ${"p50".padStart(6)}  ${"p95".padStart(6)}  ${"p99".padStart(6)}  ${"máx".padStart(6)}`);
  for (const [route, agg] of rows) {
    const s = agg.lat.slice().sort(byNumber);
    console.log(`${route.padEnd(width)}  ${String(agg.n).padStart(7)}  ${String(agg.err).padStart(6)}  ${ms(pct(s, 50)).padStart(6)}  ${ms(pct(s, 95)).padStart(6)}  ${ms(pct(s, 99)).padStart(6)}  ${ms(s[s.length - 1]).padStart(6)}`);
  }

  const failures = [];
  if (!(p95 <= P95_LIMIT)) failures.push(`p95 ${ms(p95)} ms > ${P95_LIMIT} ms`);
  if (errPct > ERR_LIMIT) failures.push(`erros ${errPct.toFixed(2)}% > ${ERR_LIMIT}%`);
  if (failures.length) {
    console.log(`\nVeredito: REPROVADO — ${failures.join(" e ")}`);
    console.log("Dica: se o p95 sobe mas o req/s para de crescer, o gargalo costuma ser o pool do PostgreSQL (o padrão do pg é 10 conexões) ou a CPU do container. Compare com o Monitor do Easypanel.");
    process.exitCode = 1;
  } else {
    console.log(`\nVeredito: APROVADO — p95 ${ms(p95)} ms ≤ ${P95_LIMIT} ms e erros ${errPct.toFixed(2)}% ≤ ${ERR_LIMIT}%`);
  }
  if (RAW_OUT) {
    require("fs").writeFileSync(RAW_OUT, JSON.stringify({
      base: BASE, users: USERS, ramp: RAMP, hold: HOLD, columns: ["t_s", "rota", "status", "ms"], records: raw,
    }));
    console.log(`Medições brutas salvas em ${RAW_OUT}`);
  }
}

async function main() {
  console.log("FutPontos · teste de carga (somente GET)");
  console.log(`Alvo: ${BASE}`);

  // confere que a API responde e descobre jogadores e fotos reais para variar as requisições
  try {
    const res = await fetch(`${BASE}/jogadores`, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) throw new Error(`HTTP ${res.status} em /jogadores`);
    learn(await res.json());
  } catch (err) {
    console.error(`Não consegui acessar ${BASE}/jogadores: ${(err && err.cause && err.cause.code) || (err && err.message)}`);
    process.exit(2);
  }
  console.log(`Usuários: ${USERS} · rampa ${RAMP} s · platô ${HOLD} s · pausa ${THINK_MIN}–${THINK_MAX} s · jogadores: ${data.ids.length} · fotos legadas: ${data.images.length} (${IMAGES} por abertura)\n`);
  console.log(`${"tempo".padStart(7)}  ${"usuários".padStart(9)}  ${"req/s".padStart(8)}  ${"p50 (ms)".padStart(9)}  ${"p95 (ms)".padStart(9)}  ${"erros".padStart(7)}`);

  startedAt = Date.now();
  lastReport = startedAt;
  rampEnd = startedAt + RAMP * 1000;
  endAt = rampEnd + HOLD * 1000;
  const timer = setInterval(reportWindow, 10000);
  process.once("SIGINT", () => {
    console.log("\nInterrompido: encerrando e calculando o resumo...");
    endAt = Date.now();
  });

  await Promise.all(Array.from({ length: USERS }, (_, index) => user(index)));
  clearInterval(timer);
  summary();
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});

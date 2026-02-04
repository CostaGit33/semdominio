import { apiRequest, showFeedback } from "./globais.js";

const ENDPOINT = "/jogadores";

const form = document.getElementById("playerForm");
const list = document.getElementById("playerList");
const submitBtn = document.getElementById("submitBtn");
const cancelBtn = document.getElementById("cancelEdit");
const formTitle = document.getElementById("formTitle");

const idField = document.getElementById("playerId");

loadPlayers();

/* ======================================================
   LISTAR JOGADORES
====================================================== */
async function loadPlayers() {
  list.innerHTML = "";

  const jogadores = await apiRequest(ENDPOINT);

  jogadores.forEach(j => {
    const li = document.createElement("li");
    li.innerHTML = `
      <strong>${j.nome}</strong>
      <span>${j.pontos ?? 0} pts</span>
      <div class="actions">
        <button onclick="editPlayer('${j.id}')">✏️</button>
        <button onclick="deletePlayer('${j.id}')">🗑️</button>
      </div>
    `;
    list.appendChild(li);
  });
}

/* ======================================================
   SUBMIT (CRIAR / EDITAR)
====================================================== */
form.addEventListener("submit", async e => {
  e.preventDefault();

  const payload = buildPayload();
  const id = idField.value;

  try {
    if (id) {
      await apiRequest(`${ENDPOINT}/${id}`, {
        method: "PUT",
        body: payload
      });
      showFeedback("Jogador atualizado!", "success");
    } else {
      await apiRequest(ENDPOINT, {
        method: "POST",
        body: payload
      });
      showFeedback("Jogador cadastrado!", "success");
    }

    resetForm();
    loadPlayers();
  } catch (err) {
    showFeedback("Erro ao salvar jogador", "error");
  }
});

/* ======================================================
   EDITAR
====================================================== */
window.editPlayer = async id => {
  const j = await apiRequest(`${ENDPOINT}/${id}`);

  idField.value = j.id;
  nome.value = j.nome;
  foto.value = j.foto || "";
  gols.value = j.gols;
  vitorias.value = j.vitorias;
  empate.value = j.empate;
  defesa.value = j.defesa;
  infracoes.value = j.infracoes;

  submitBtn.textContent = "Atualizar";
  cancelBtn.classList.remove("hidden");
  formTitle.textContent = "✏️ Editar Jogador";
};

/* ======================================================
   EXCLUIR
====================================================== */
window.deletePlayer = async id => {
  if (!confirm("Excluir jogador?")) return;

  await apiRequest(`${ENDPOINT}/${id}`, { method: "DELETE" });
  showFeedback("Jogador removido", "success");
  loadPlayers();
};

/* ======================================================
   RESET
====================================================== */
cancelBtn.addEventListener("click", resetForm);

function resetForm() {
  form.reset();
  idField.value = "";
  submitBtn.textContent = "Salvar";
  cancelBtn.classList.add("hidden");
  formTitle.textContent = "➕ Novo Jogador";
}

/* ======================================================
   PAYLOAD
====================================================== */
function buildPayload() {
  return {
    nome: nome.value.trim(),
    foto: foto.value || null,
    gols: +gols.value || 0,
    vitorias: +vitorias.value || 0,
    empate: +empate.value || 0,
    defesa: +defesa.value || 0,
    infracoes: +infracoes.value || 0
  };
}

console.info("%cFutPontos | Gerenciamento ativo", "color:#D62828;font-weight:bold");

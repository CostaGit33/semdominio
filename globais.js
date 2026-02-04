/* ======================================================
   CONFIGURAÇÃO DA API
====================================================== */

export const API_BASE_URL = "https://api.semdominio.online";

/**
 * Cliente padrão para comunicação com a API
 * - GET é o padrão
 * - JSON automático
 * - Erros tratados de forma consistente
 */
export async function apiRequest(endpoint, options = {}) {
  const config = {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
  };

  if (options.body) {
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

  let data = null;
  const contentType = response.headers.get("content-type");

  if (contentType && contentType.includes("application/json")) {
    data = await response.json();
  } else {
    const text = await response.text();
    data = { message: text };
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
      data?.message ||
      `Erro HTTP ${response.status}`
    );
  }

  return data;
}

/* ======================================================
   REGRAS DE NEGÓCIO
====================================================== */

/**
 * Regra oficial de pontuação (MESMA do backend)
 * ⚠️ Deve refletir exatamente o server.js
 */
export function calculatePoints({
  vitorias = 0,
  gols = 0,
  defesa = 0,
  empate = 0,
  infracoes = 0,
}) {
  return (
    Number(vitorias) +
    Number(gols) +
    Number(defesa) +
    Number(empate) -
    Number(infracoes) * 2
  );
}

/* ======================================================
   UI – FEEDBACK GLOBAL
====================================================== */

export function showFeedback(message, type = "success") {
  let container = document.getElementById("feedback");

  if (!container) {
    container = document.createElement("div");
    container.id = "feedback";
    document.body.appendChild(container);
  }

  const feedback = document.createElement("div");
  feedback.className = `feedback ${type}`;
  feedback.textContent = message;

  container.appendChild(feedback);

  setTimeout(() => {
    feedback.classList.add("hide");
    setTimeout(() => feedback.remove(), 300);
  }, 3000);
}

/* ======================================================
   UI GLOBAL
====================================================== */

function initGlobalUI() {
  /* Menu mobile */
  const menuToggle = document.querySelector(".menu-toggle");
  const appNav = document.querySelector(".app-nav");

  if (menuToggle && appNav) {
    menuToggle.addEventListener("click", () => {
      appNav.classList.toggle("active");
    });
  }

  /* Link ativo */
  const currentPage =
    window.location.pathname.split("/").pop() || "index.html";

  document.querySelectorAll(".app-nav a").forEach(link => {
    const href = link.getAttribute("href");
    if (href === currentPage) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });

  /* Footer */
  const footer = document.querySelector(".app-footer");
  if (footer) {
    footer.innerHTML = `
      <small>
        © ${new Date().getFullYear()} FutPontos • Sem Domínio
      </small>
    `;
  }
}

/* ======================================================
   INIT
====================================================== */

document.addEventListener("DOMContentLoaded", initGlobalUI);

// assets/js/globais.js

/* ======================================================
   CONFIGURAÇÃO GLOBAL DA API
====================================================== */

export const API_BASE = "https://api.semdominio.online";

/**
 * Cliente padrão para requisições na API
 */
export async function apiFetch(endpoint, options = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || "Erro na requisição");
  }

  return res.json();
}

/* ======================================================
   UI HELPERS
====================================================== */

export function showFeedback(message, type = "success") {
  const feedbackContainer = document.getElementById("feedback");
  if (!feedbackContainer) return;

  feedbackContainer.innerHTML = "";

  const feedback = document.createElement("div");
  feedback.className = `feedback ${type}`;
  feedback.textContent = message;

  feedbackContainer.appendChild(feedback);
  setTimeout(() => feedback.remove(), 3000);
}

/* ======================================================
   REGRAS DE NEGÓCIO
====================================================== */

export function calculatePoints(victories, draws, defenses, goals, infractions) {
  return victories * 3 + draws + defenses + goals * 2 - (infractions * 2);
}

/* ======================================================
   SCRIPTS GLOBAIS (MENU / FOOTER / UX)
====================================================== */

function initializeGlobalScripts() {

  // MENU
  const menuButton = document.getElementById('menuButton');
  const menu = document.getElementById('menu');

  if (menuButton && menu) {
    menuButton.addEventListener('click', () => {
      menu.classList.toggle('visible');
    });
  }

  // LINK ATIVO
  const menuItems = document.querySelectorAll("header nav a");
  const currentPage = window.location.pathname.split("/").pop();

  menuItems.forEach((item) => {
    const itemHref = item.getAttribute("href");
    item.classList.toggle("active", itemHref === currentPage);
  });

  // FOOTER DINÂMICO
  const footer = document.querySelector("footer");
  if (footer) {
    footer.innerHTML = `&copy; ${new Date().getFullYear()} Romulo Costa. Todos os direitos reservados.`;
  }

  // LOG
  console.info("%cFutpontos ativo", "color:#0bbcd6;font-size:14px;font-weight:bold");
}

document.addEventListener("DOMContentLoaded", initializeGlobalScripts);

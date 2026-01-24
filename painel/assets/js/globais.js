// js/globais.js

/**
 * Objeto utilitário para manipular o localStorage de forma segura.
 * Agrupa as funções para melhor organização.
 */
export const StorageUtil = {
  /**
   * Busca um item no localStorage e o converte de JSON.
   * @param {string} key - A chave do item a ser buscado.
   * @returns {any} Os dados desserializados ou um array vazio se não encontrar.
   */
  get(key) {
    try {
      return JSON.parse(localStorage.getItem(key)) || [];
    } catch (e) {
      console.error("Erro ao ler do localStorage:", e);
      return [];
    }
  },

  /**
   * Salva dados no localStorage, convertendo para JSON.
   * @param {string} key - A chave onde os dados serão salvos.
   * @param {any} data - Os dados a serem salvos.
   */
  set(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  },

  /**
   * Remove um item do localStorage.
   * @param {string} key - A chave do item a ser removido.
   */
  clear(key) {
    localStorage.removeItem(key);
  },
};

/**
 * Exibe uma mensagem de feedback temporária na tela.
 * @param {string} message - A mensagem a ser exibida.
 * @param {string} [type="success"] - O tipo de feedback ("success" ou "error").
 */
export function showFeedback(message, type = "success") {
  const feedbackContainer = document.getElementById("feedback");
  if (!feedbackContainer) return;

  feedbackContainer.innerHTML = ""; // Limpa feedbacks anteriores

  const feedback = document.createElement("div");
  feedback.className = `feedback ${type}`;
  feedback.textContent = message;

  feedbackContainer.appendChild(feedback);
  setTimeout(() => feedback.remove(), 3000);
}

/**
 * Calcula os pontos de um jogador com base em suas estatísticas.
 */
export function calculatePoints(victories, draws, defenses, goals, infractions) {
  return victories * 3 + draws + defenses + goals * 2 - (infractions * 2);
}


/**
 * Função principal que inicializa todos os scripts globais.
 * É chamada quando o DOM está completamente carregado.
 */
function initializeGlobalScripts() {
  
  // 1. Lógica do Menu (centralizada aqui)
  const menuButton = document.getElementById('menuButton');
  const menu = document.getElementById('menu');

  if (menuButton && menu) {
    menuButton.addEventListener('click', () => {
      menu.classList.toggle('visible');
    });
  }

  // 2. Define o item de menu ativo
  const menuItems = document.querySelectorAll("header nav a");
  const currentPage = window.location.pathname.split("/").pop();

  menuItems.forEach((item) => {
    const itemHref = item.getAttribute("href");
    // Compara se o href do item é igual ao nome do arquivo da página atual
    item.classList.toggle("active", itemHref === currentPage);
  });

  // 3. Atualiza o ano no rodapé
  const footer = document.querySelector("footer");
  if (footer) {
    const currentYear = new Date().getFullYear();
    footer.innerHTML = `&copy; ${currentYear} Romulo Costa. Todos os direitos reservados.`;
  }

  // 4. Mensagem de boas-vindas no console
  console.info("%cBem-vindo ao Futpontos!", "color: #005f73; font-size: 16px; font-weight: bold;");
  console.log("Explore as páginas do site e aproveite os recursos disponíveis.");
}

// Garante que todo o código que manipula o DOM só rode após a página carregar.
document.addEventListener("DOMContentLoaded", initializeGlobalScripts);

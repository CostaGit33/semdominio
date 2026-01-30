// assets/js/modal.js

document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('welcomeModal');
  const closeModalBtn = document.getElementById('closeModalBtn');

  if (!modal || !closeModalBtn) return;

  function showModal() {
    modal.style.display = 'flex';
  }

  function closeModal() {
    modal.style.display = 'none';
    localStorage.setItem("futpontos_modal", "true");
  }

  // 👉 Só mostra se ainda não foi exibido neste navegador
  const jaViu = localStorage.getItem("futpontos_modal");
  if (!jaViu) {
    showModal();
  }

  // Botão fechar
  closeModalBtn.addEventListener('click', closeModal);

  // Clique fora do conteúdo
  window.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  // Tecla ESC
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeModal();
    }
  });
});

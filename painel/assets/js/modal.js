// js/modal.js ou js/index.js

// Garante que o script só execute após o carregamento completo do HTML.
document.addEventListener('DOMContentLoaded', () => {
    // 1. Seleciona os elementos do modal.
    const modal = document.getElementById('welcomeModal');
    const closeModalBtn = document.getElementById('closeModalBtn');

    // Se os elementos do modal não existirem nesta página, o script para aqui.
    if (!modal || !closeModalBtn) {
        return;
    }

    // 2. Função para exibir o modal.
    function showModal() {
        modal.style.display = 'block';
    }

    // 3. Função para fechar o modal.
    function closeModal() {
        modal.style.display = 'none';
    }

    // 4. Adiciona os "escutadores de eventos" usando addEventListener.
    
    // Exibe o modal assim que a página é carregada.
    showModal();

    // Evento para fechar o modal ao clicar no botão "X".
    closeModalBtn.addEventListener('click', closeModal);

    // Evento para fechar o modal ao clicar fora da área de conteúdo.
    window.addEventListener('click', (event) => {
        // Verifica se o clique foi diretamente no fundo escuro do modal.
        if (event.target === modal) {
            closeModal();
        }
    });

    // Evento para fechar o modal ao pressionar a tecla "Escape".
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeModal();
        }
    });
});

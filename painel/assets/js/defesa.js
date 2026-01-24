// js/defesa.js

// 1. Importa os utilitários do arquivo global.
import { StorageUtil, showFeedback } from './globais.js';

// Ponto de entrada: espera o DOM carregar para executar o script.
document.addEventListener("DOMContentLoaded", () => {
    const playerListContainer = document.getElementById("playerList");

    // Se não encontrar a tabela nesta página, interrompe a execução.
    if (!playerListContainer) return;

    /**
     * Função principal: busca os dados, ordena por defesas e desenha a tabela.
     */
    function renderDefenseRanking() {
        const players = StorageUtil.get("players");

        // Ordena os jogadores pela quantidade de defesas (do maior para o menor).
        players.sort((a, b) => b.defesas - a.defesas);

        playerListContainer.innerHTML = ""; // Limpa a tabela antes de redesenhar.

        if (players.length === 0) {
            playerListContainer.innerHTML = `<tr><td colspan="3" class="empty-message">Nenhum jogador cadastrado.</td></tr>`;
            return;
        }

        players.forEach((player) => {
            const row = document.createElement("tr");
            row.dataset.nome = player.nome; // Usa 'data-nome' para identificar a linha.

            row.innerHTML = `
                <td>${player.nome}</td>
                <td>${player.defesas}</td>
                <td class="actions">
                    <button class="delete-btn">🗑️</button> <!-- Botão de lixeira -->
                </td>
            `;
            playerListContainer.appendChild(row);
        });
    }

    /**
     * Remove um jogador da lista após confirmação.
     * @param {string} playerName - O nome do jogador a ser removido.
     */
    function deletePlayer(playerName) {
        // Pede confirmação ao usuário antes de uma ação destrutiva.
        if (!confirm(`Tem certeza que deseja remover o jogador ${playerName}?`)) {
            return; // Se o usuário clicar em "Cancelar", a função para aqui.
        }
        
        let players = StorageUtil.get("players");
        // Filtra a lista, mantendo apenas os jogadores cujo nome é diferente do que foi clicado.
        players = players.filter(p => p.nome !== playerName);
        
        StorageUtil.set("players", players); // Salva a nova lista (sem o jogador removido).
        renderDefenseRanking(); // Redesenha a tabela para refletir a remoção.
        showFeedback(`Jogador ${playerName} removido com sucesso!`);
    }

    // Delegação de Eventos: um único listener para gerenciar os cliques na lixeira.
    playerListContainer.addEventListener('click', (event) => {
        const target = event.target;
        const row = target.closest('tr'); // Encontra a linha (tr) pai do botão clicado.

        // Verifica se o clique foi em um botão de deletar.
        if (target.classList.contains('delete-btn') && row) {
            const playerName = row.dataset.nome; // Pega o nome do jogador a partir do 'data-nome'.
            deletePlayer(playerName);
        }
    });

    // Renderiza a tabela de ranking de defesas assim que a página é carregada.
    renderDefenseRanking();
});

// js/empate.js

// 1. Importa os utilitários do arquivo global.
import { StorageUtil, showFeedback } from './globais.js';

// Ponto de entrada: espera o DOM carregar para executar o script.
document.addEventListener("DOMContentLoaded", () => {
    const playerListContainer = document.getElementById("playerList");

    // Se não encontrar a tabela nesta página, interrompe a execução.
    if (!playerListContainer) return;

    /**
     * Função principal: busca os dados, ordena por empates e desenha a tabela.
     */
    function renderDrawRanking() {
        const players = StorageUtil.get("players");

        // Ordena os jogadores pela quantidade de empates (do maior para o menor).
        players.sort((a, b) => b.empates - a.empates);

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
                <td>${player.empates}</td>
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
        if (!confirm(`Tem certeza que deseja remover o jogador ${playerName}?`)) {
            return;
        }
        
        let players = StorageUtil.get("players");
        players = players.filter(p => p.nome !== playerName);
        
        StorageUtil.set("players", players);
        renderDrawRanking(); // Redesenha a tabela de empates.
        showFeedback(`Jogador ${playerName} removido com sucesso!`);
    }

    // Delegação de Eventos: um único listener para gerenciar os cliques na lixeira.
    playerListContainer.addEventListener('click', (event) => {
        const target = event.target;
        const row = target.closest('tr');

        if (target.classList.contains('delete-btn') && row) {
            const playerName = row.dataset.nome;
            deletePlayer(playerName);
        }
    });

    // Renderiza a tabela de ranking de empates assim que a página é carregada.
    renderDrawRanking();
});

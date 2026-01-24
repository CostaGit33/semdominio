// js/classificacao.js

// 1. Importa os utilitários do arquivo global.
//    Isso permite reutilizar código e mantém os arquivos organizados.
import { StorageUtil, showFeedback, calculatePoints } from './globais.js';

// Ponto de entrada: espera o DOM carregar para executar o script.
document.addEventListener("DOMContentLoaded", () => {
    const playerListContainer = document.getElementById("playerList");

    // Se não encontrar a tabela nesta página, não faz nada.
    if (!playerListContainer) return;

    /**
     * Função principal: busca os dados, ordena e desenha a tabela de classificação.
     */
    function renderPlayers() {
        const players = StorageUtil.get("players");

        // Ordena os jogadores pela pontuação (do maior para o menor).
        players.sort((a, b) => b.pontos - a.pontos);

        playerListContainer.innerHTML = ""; // Limpa a tabela antes de redesenhar.

        if (players.length === 0) {
            playerListContainer.innerHTML = `<tr><td colspan="8" class="empty-message">Nenhum jogador cadastrado ainda. Adicione um na página "Novo Jogador".</td></tr>`;
            return;
        }

        players.forEach((player) => {
            const row = document.createElement("tr");
            // Usa 'data-nome' para identificar a linha facilmente.
            row.dataset.nome = player.nome;

            row.innerHTML = `
                <td>${player.nome}</td>
                <td>${player.pontos}</td>
                <td>${player.vitorias}</td>
                <td>${player.gols}</td>
                <td>${player.defesas}</td>
                <td>${player.empates}</td>
                <td>${player.infracoes}</td>
                <td class="actions">
                    <button class="edit-btn">✏️</button>
                </td>
            `;
            playerListContainer.appendChild(row);
        });
    }

    /**
     * Transforma uma linha da tabela em um formulário de edição.
     * @param {string} playerName - O nome do jogador a ser editado.
     */
    function editPlayer(playerName) {
        const players = StorageUtil.get("players");
        const player = players.find(p => p.nome === playerName);
        if (!player) return;

        const playerRow = playerListContainer.querySelector(`[data-nome="${playerName}"]`);
        if (!playerRow) return;

        // Substitui o conteúdo da linha por inputs preenchidos com os dados atuais.
        playerRow.innerHTML = `
            <td><input type="text" id="editNome" value="${player.nome}"></td>
            <td><input type="number" id="editPontos" value="${player.pontos}" disabled></td>
            <td><input type="number" id="editVitorias" value="${player.vitorias}"></td>
            <td><input type="number" id="editGols" value="${player.gols}"></td>
            <td><input type="number" id="editDefesas" value="${player.defesas}"></td>
            <td><input type="number" id="editEmpates" value="${player.empates}"></td>
            <td><input type="number" id="editInfracoes" value="${player.infracoes}"></td>
            <td class="actions">
                <button class="save-btn">💾</button>
                <button class="cancel-btn">❌</button>
            </td>
        `;
    }

    /**
     * Salva as alterações feitas em um jogador.
     * @param {string} originalName - O nome original do jogador para encontrá-lo na lista.
     */
    function savePlayerEdits(originalName) {
        const players = StorageUtil.get("players");
        const playerIndex = players.findIndex(p => p.nome === originalName);
        if (playerIndex === -1) return;

        // Pega os novos valores dos inputs de edição
        const editedName = document.getElementById("editNome").value.trim();
        const editedVictories = parseInt(document.getElementById("editVitorias").value, 10) || 0;
        const editedGoals = parseInt(document.getElementById("editGols").value, 10) || 0;
        const editedDefenses = parseInt(document.getElementById("editDefesas").value, 10) || 0;
        const editedDraws = parseInt(document.getElementById("editEmpates").value, 10) || 0;
        const editedInfractions = parseInt(document.getElementById("editInfracoes").value, 10) || 0;

        // Recalcula os pontos com os novos valores
        const editedPoints = calculatePoints(editedVictories, editedDraws, editedDefenses, editedGoals, editedInfractions);

        // Atualiza o jogador na lista
        players[playerIndex] = {
            nome: editedName,
            vitorias: editedVictories,
            gols: editedGoals,
            defesas: editedDefenses,
            empates: editedDraws,
            infracoes: editedInfractions,
            pontos: editedPoints,
        };

        StorageUtil.set("players", players); // Salva a lista atualizada
        renderPlayers(); // Redesenha a tabela
        showFeedback(`Jogador ${editedName} atualizado com sucesso!`);
    }

    /**
     * Remove um jogador da lista.
     * @param {string} playerName - O nome do jogador a ser removido.
     */
    function deletePlayer(playerName) {
        if (!confirm(`Tem certeza que deseja remover o jogador ${playerName}?`)) {
            return;
        }
        
        let players = StorageUtil.get("players");
        players = players.filter(p => p.nome !== playerName);
        
        StorageUtil.set("players", players);
        renderPlayers();
        showFeedback(`Jogador ${playerName} removido com sucesso!`, "success");
    }

    // Delegação de Eventos: um único listener na tabela para gerenciar todos os cliques.
    playerListContainer.addEventListener('click', (event) => {
        const target = event.target;
        const row = target.closest('tr');
        if (!row) return;

        const playerName = row.dataset.nome;

        if (target.classList.contains('edit-btn')) {
            editPlayer(playerName);
        }
        if (target.classList.contains('save-btn')) {
            savePlayerEdits(playerName);
        }
        if (target.classList.contains('cancel-btn')) {
            renderPlayers(); // Simplesmente redesenha a tabela para cancelar a edição
        }
        if (target.classList.contains('delete-btn')) {
            deletePlayer(playerName);
        }
    });

    // Renderiza a tabela assim que a página é carregada.
    renderPlayers();
});

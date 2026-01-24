// js/adicionar.js

// 1. Importa as funções e utilitários necessários do arquivo global.
import { StorageUtil, showFeedback, calculatePoints } from './globais.js';

// 2. Ponto de entrada: todo o código é executado após o carregamento do DOM.
document.addEventListener("DOMContentLoaded", () => {
  const playerForm = document.getElementById("playerForm");

  // Se o formulário não existir nesta página, o script não faz nada.
  if (!playerForm) return;

  // --- CONFIGURAÇÃO DAS ETAPAS ---
  const steps = Array.from(playerForm.querySelectorAll('.form-step'));
  const nextButtons = playerForm.querySelectorAll('.next-btn');
  const prevButtons = playerForm.querySelectorAll('.prev-btn');
  let currentStepIndex = 0; // Controla o índice da etapa atual

  /**
   * Navega para uma etapa específica do formulário.
   * @param {number} stepIndex - O índice da etapa para a qual navegar.
   */
  function goToStep(stepIndex) {
    // Esconde a etapa atual
    if (steps[currentStepIndex]) {
      steps[currentStepIndex].classList.remove('active');
    }
    // Mostra a nova etapa
    if (steps[stepIndex]) {
      steps[stepIndex].classList.add('active');
      currentStepIndex = stepIndex;
    }
  }

  // --- LÓGICA DE NAVEGAÇÃO ---

  // Adiciona eventos de clique para todos os botões "Avançar"
  nextButtons.forEach(button => {
    button.addEventListener('click', () => {
      const currentStepElement = steps[currentStepIndex];
      const input = currentStepElement.querySelector('input[required]');

      // Validação: verifica se o campo de nome (na primeira etapa) está preenchido
      if (input && input.id === 'playerName' && !input.value.trim()) {
        showFeedback("Por favor, insira um nome para o jogador.", "error");
        return; // Impede de avançar se o nome estiver vazio
      }

      // Se for válido e não for a última etapa, avança
      if (currentStepIndex < steps.length - 1) {
        goToStep(currentStepIndex + 1);
      }
    });
  });

  // Adiciona eventos de clique para todos os botões "Voltar"
  prevButtons.forEach(button => {
    button.addEventListener('click', () => {
      if (currentStepIndex > 0) {
        goToStep(currentStepIndex - 1);
      }
    });
  });

  // --- LÓGICA DE SUBMISSÃO ---

  /**
   * Coleta todos os dados do formulário, valida e salva o novo jogador.
   */
  function addPlayer() {
    // Usa FormData para coletar todos os valores do formulário de uma vez
    const formData = new FormData(playerForm);
    
    const playerName = formData.get('playerName').trim();
    const victories = parseInt(formData.get('playerVitorias'), 10) || 0;
    const draws = parseInt(formData.get('playerEmpates'), 10) || 0;
    const defenses = parseInt(formData.get('playerDefesas'), 10) || 0;
    const goals = parseInt(formData.get('playerGols'), 10) || 0;
    const infractions = parseInt(formData.get('playerInfractions'), 10) || 0;

    // Validação final (embora a primeira etapa já valide o nome)
    if (!playerName) {
      showFeedback("O nome do jogador é obrigatório.", "error");
      goToStep(0); // Leva o usuário de volta para a etapa do nome
      return;
    }

    const players = StorageUtil.get("players");
    if (players.some((player) => player.nome === playerName)) { 
      showFeedback("Um jogador com este nome já existe na lista.", "error");
      goToStep(0); // Leva o usuário de volta para a etapa do nome para correção
      return;
    }

    const points = calculatePoints(victories, draws, defenses, goals, infractions);
    
    const newPlayer = { 
      nome: playerName,
      vitorias: victories,
      empates: draws,
      defesas: defenses,
      gols: goals,
      infracoes: infractions,
      pontos: points 
    };

    players.push(newPlayer);
    StorageUtil.set("players", players);

    showFeedback(`Jogador ${playerName} adicionado com sucesso!`, "success");
    
    // Limpa o formulário e volta para a primeira etapa
    playerForm.reset(); 
    goToStep(0);
  }

  // Adiciona o listener para o evento de 'submit' do formulário
  playerForm.addEventListener("submit", (e) => {
    e.preventDefault(); // Previne o recarregamento da página
    addPlayer();
  });

  // Garante que o formulário sempre comece na primeira etapa ao carregar a página
  goToStep(0);
});

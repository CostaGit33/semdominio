// assets/js/adicionar.js

const API_URL = "https://api.semdominio.online/jogadores";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("playerForm");
  const feedback = document.getElementById("feedback");
  const steps = document.querySelectorAll(".form-step");

  let currentStep = 0;

  // ======================
  // CONTROLE DE ETAPAS
  // ======================
  function showStep(index) {
    steps.forEach((step, i) => {
      step.classList.toggle("active", i === index);
    });
  }

  document.querySelectorAll(".next-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (currentStep < steps.length - 1) {
        currentStep++;
        showStep(currentStep);
      }
    });
  });

  document.querySelectorAll(".prev-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (currentStep > 0) {
        currentStep--;
        showStep(currentStep);
      }
    });
  });

  // ======================
  // SUBMIT
  // ======================
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const nome = document.getElementById("playerName").value.trim();
    const vitorias = Number(document.getElementById("playerVitorias").value);
    const empates = Number(document.getElementById("playerEmpates").value);
    const gols = Number(document.getElementById("playerGols").value);
    const defesa = Number(document.getElementById("playerDefesas").value);
    const infracoes = Number(document.getElementById("playerInfractions").value);

    if (!nome) {
      show("Informe o nome do jogador", "error");
      return;
    }

    // Regra de pontuação (ajustável)
    const pontos = (vitorias * 3) + empates + gols + defesa - infracoes;

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          pontos,
          vitorias,
          gols,
          defesa,
          empate: empates
        })
      });

      if (!res.ok) throw new Error("Erro ao salvar jogador");

      show("Jogador cadastrado com sucesso ✅", "success");
      form.reset();
      currentStep = 0;
      showStep(currentStep);

    } catch (err) {
      console.error(err);
      show("Erro ao salvar jogador ❌", "error");
    }
  });

  function show(msg, type) {
    feedback.innerText = msg;
    feedback.className = type;
  }

  showStep(currentStep);
});

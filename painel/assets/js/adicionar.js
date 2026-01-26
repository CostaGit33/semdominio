document.getElementById("form-jogador").addEventListener("submit", async (event) => {
    event.preventDefault();

    const btnEnviar = document.getElementById("btn-enviar");
    const divMensagem = document.getElementById("mensagem");

    // --- CONFIGURAÇÃO DA URL ---
    // Use a URL pública da sua API no Easypanel
    const API_URL = "https://SUA-URL-DA-API.com/jogadores";

    // Captura os dados do formulário exatamente como o banco espera
    const dados = {
        nome: document.getElementById("nome" ).value.trim(),
        time: document.getElementById("time").value.trim(),
        pontos: parseInt(document.getElementById("pontos").value) || 0,
        vitorias: parseInt(document.getElementById("vitorias").value) || 0,
        gols: parseInt(document.getElementById("gols").value) || 0,
        defesa: parseInt(document.getElementById("defesa").value) || 0,
        empate: parseInt(document.getElementById("empate").value) || 0
    };

    try {
        btnEnviar.disabled = true;
        btnEnviar.innerText = "Enviando para o Banco...";

        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(dados)
        });

        if (response.ok) {
            const resultado = await response.json();
            console.log("Sucesso:", resultado);
            
            // Feedback visual de sucesso
            alert("✅ Jogador " + dados.nome + " adicionado com sucesso!");
            
            // Limpa o formulário
            document.getElementById("form-jogador").reset();
        } else {
            throw new Error("Erro ao salvar no servidor");
        }
    } catch (error) {
        console.error("Erro na requisição:", error);
        alert("❌ Erro ao conectar com a API. Verifique se a URL está correta.");
    } finally {
        btnEnviar.disabled = false;
        btnEnviar.innerText = "Salvar no Banco de Dados";
    }
});

document.getElementById("form-jogador").addEventListener("submit", async (event) => {
    event.preventDefault();

    const btnEnviar = document.getElementById("btn-enviar");
    const divMensagem = document.getElementById("mensagem");

    // --- CONFIGURAÇÃO DA URL ---
    const API_URL = "https://api.semdominio.online/jogadores";

    // Captura todos os campos e converte para os tipos corretos
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
        btnEnviar.innerText = "Enviando dados...";
        divMensagem.style.display = "none";

        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(dados)
        });

        if (response.ok) {
            const resultado = await response.json();
            console.log("Sucesso:", resultado);
            
            divMensagem.style.display = "block";
            divMensagem.style.backgroundColor = "#d4edda";
            divMensagem.style.color = "#155724";
            divMensagem.innerText = `✅ ${dados.nome} cadastrado com sucesso!`;
            
            document.getElementById("form-jogador").reset();
        } else {
            throw new Error("Erro no servidor");
        }
    } catch (error) {
        console.error("Erro:", error);
        divMensagem.style.display = "block";
        divMensagem.style.backgroundColor = "#f8d7da";
        divMensagem.style.color = "#721c24";
        divMensagem.innerText = "❌ Erro ao conectar com a API. Verifique a URL.";
    } finally {
        btnEnviar.disabled = false;
        btnEnviar.innerText = "Salvar no Banco de Dados";
    }
});

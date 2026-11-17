# Autenticação do registro de partidas pelo n8n

A rota `POST /partida/registrar` não aceita mais chamadas anônimas.

Ela aceita uma destas credenciais:

1. **Administrador:** `Authorization: Bearer <token-da-sessao>`.
2. **n8n interno:** `X-FutPontos-Webhook-Secret: <FUTPONTOS_N8N_WEBHOOK_SECRET>`.

A comparação do segredo é feita em tempo constante. A API lê o segredo exclusivamente do ambiente; ele não deve ser colocado no aplicativo Flutter, no corpo JSON nem em código público.

## Ajuste necessário no n8n

No nó **HTTP Request** que envia o resultado do workflow para `POST https://api.semdominio.online/partida/registrar`:

- Método: `POST`.
- Preserve o corpo JSON atual, incluindo `operacao_id`, `coletivo`, `individual` e `goleiros`.
- Adicione o cabeçalho `X-FutPontos-Webhook-Secret`.
- Use o mesmo valor guardado na credencial de autenticação do webhook de entrada, correspondente a `FUTPONTOS_N8N_WEBHOOK_SECRET` na API. Prefira uma credencial do n8n; não grave o valor em texto no workflow exportado.

## Resultado esperado

- Sem credencial: HTTP 401.
- Com sessão de administrador válida: a rota segue a validação normal da sessão.
- Com segredo interno correto: a rota aceita a chamada do n8n.
- Operação já processada: HTTP 409, preservando a proteção de idempotência existente.

**Não implante a nova versão da API antes de adicionar o cabeçalho ao nó HTTP Request do n8n**, para não interromper o registro inteligente de partidas.

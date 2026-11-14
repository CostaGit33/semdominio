# Administração FutPontos

## Acesso inicial

1. Cadastre sua conta pelo aplicativo.
2. No console do serviço da API, dentro da pasta `api`, execute:

```bash
node scripts/admin.js promover SEU_EMAIL
```

Para listar administradores:

```bash
node scripts/admin.js listar
```

Para remover o papel administrativo:

```bash
node scripts/admin.js rebaixar EMAIL
```

A API cria o campo de papel automaticamente. O papel padrão é `user`; somente `admin` acessa as rotas `/admin/*` e executa operações administrativas protegidas. Depois de promover uma conta, encerre a sessão e entre novamente.

## Painel no aplicativo

A administração usa a mesma conta e o mesmo token de autenticação do FutPontos. Não existe senha administrativa separada.

- **Resumo:** usuários, jogadores, goleiros, vínculos pendentes, sessões ativas e competência atual.
- **Pessoas:** contas, situação, papel e vínculo esportivo.
- **Aprovações:** aprovar ou rejeitar solicitações de vínculo de jogadores e goleiros.
- **Segurança:** promover/rebaixar administradores e bloquear/desbloquear contas.
- **Registro:** últimas 200 alterações administrativas com autor, ação, alvo e data.

## Segurança

- A API valida o token e o papel em cada chamada administrativa.
- Usuários comuns recebem HTTP 403 nas rotas administrativas.
- A conta não pode alterar o próprio papel nem bloquear a si mesma.
- O último administrador ativo não pode ser removido pelo painel ou pelo script.
- Bloquear uma conta revoga as sessões existentes.
- Alterações administrativas ficam registradas em `app_admin_audit`.
- Cadastro público nunca concede papel administrativo.

## Registro inteligente pelo aplicativo

A rota `POST /admin/registro-inteligente` recebe mensagens em linguagem natural do painel Flutter. Ela exige a mesma sessão Bearer e o papel `admin` das demais rotas administrativas.

Configure somente no ambiente do serviço da API:

- `FUTPONTOS_N8N_WEBHOOK_URL`: URL HTTPS do Webhook de produção do n8n.
- `FUTPONTOS_N8N_WEBHOOK_SECRET`: segredo aleatório compartilhado entre a API e o workflow.

A API envia ao n8n um JSON com `mensagem`, `source`, `operacao_id` e os dados do administrador autenticado. O workflow deve validar o cabeçalho `X-FutPontos-Webhook-Secret` antes de processar a mensagem.

**Contrato obrigatório da resposta do n8n:** responder ao Webhook com JSON no formato abaixo, somente depois de receber a confirmação da chamada `POST /partida/registrar`:

```json
{
  "success": true,
  "message": "Partida registrada com sucesso.",
  "api_result": {
    "success": true,
    "jogadores_atualizados": []
  }
}
```

O campo `api_result` deve conter a resposta real de `/partida/registrar`. Se a API retornar erro, o workflow deve responder com `success: false` e uma mensagem de erro. A rota administrativa não considera uma resposta da IA ou do n8n, isoladamente, como confirmação de registro.

A rota cria o identificador `operacao_id` com prefixo `app_` e registra a confirmação na auditoria administrativa. O limite de processamento síncrono é de 90 segundos.

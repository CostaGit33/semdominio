# Administração FutPontos

## Acesso inicial

1. Cadastre sua conta pelo aplicativo.
2. No console do serviço da API, dentro da pasta \`api\`, execute:

\`\`\`bash
node scripts/admin.js promover SEU_EMAIL
\`\`\`

Para listar administradores:

\`\`\`bash
node scripts/admin.js listar
\`\`\`

Para remover o papel administrativo:

\`\`\`bash
node scripts/admin.js rebaixar EMAIL
\`\`\`

A API cria o campo de papel automaticamente. O papel padrão é \`user\`; somente \`admin\` acessa as rotas \`/admin/*\` e executa operações administrativas protegidas. Depois de promover uma conta, encerre a sessão e entre novamente.

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
- Alterações administrativas ficam registradas em \`app_admin_audit\`.
- Cadastro público nunca concede papel administrativo.

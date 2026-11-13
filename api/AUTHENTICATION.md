# Autenticação de contas do aplicativo FutPontos

A autenticação é destinada ao aplicativo Flutter. O PWA e o painel administrativo não são alterados por esta entrega.

## Rotas

- `POST /auth/register`
  - Body: `{ "nome": "...", "email": "...", "senha": "...", "tipo_perfil": "jogador|goleiro", "perfil_id": 123 }`
  - `tipo_perfil` e `perfil_id` são opcionais, mas devem ser enviados juntos.
  - Ao solicitar vínculo, a API confirma que o ID existe e grava a solicitação como `pending`.
  - Nunca aceita papel administrativo enviado pelo cliente.
- `POST /auth/login`
  - Body: `{ "email": "...", "senha": "..." }`
  - Retorna token opaco e validade de 30 dias.
- `GET /auth/me`
  - Requer `Authorization: Bearer <token>`.
  - Retorna a conta e os pedidos de vínculo.
- `POST /auth/logout`
  - Requer o mesmo Bearer token e revoga a sessão atual.

## Persistência

As tabelas `app_users`, `app_sessions` e `app_profile_link_requests` são criadas automaticamente pela API. Senhas usam scrypt com salt aleatório; tokens não são armazenados em texto puro.

## Aprovação de vínculo

O status inicial é sempre `pending`. Não existe rota pública para aprovar vínculos nesta etapa. A aprovação deverá ser implementada por um fluxo administrativo autenticado, ou realizada diretamente por operador autorizado no banco até que esse fluxo exista. Não conceder aprovação por autoatendimento.

## Implantação e pendências de segurança

- Implantar a nova versão da API antes de liberar o cadastro no APK.
- Verificar a migração automática das três tabelas no PostgreSQL.
- Antes de uso amplo, implementar verificação de e-mail, recuperação de senha, rate limit persistente para login/cadastro e gestão administrativa dos vínculos.
- As rotas legadas de escrita continuam com o comportamento atual; esta implementação não as protege globalmente para evitar quebra de integrações/PWA. Não interpretar a tela de login como autorização completa da API.

## Alteração de foto de perfil

- `POST /jogadores/:id/foto` exige `Authorization: Bearer <token>` e campo multipart `foto`.
- `POST /goleiros/:id/foto` aplica a mesma regra para goleiros.
- A API só aceita a alteração quando a conta autenticada possui vínculo com o perfil correspondente em estado `approved`.
- Vínculos `pending` ou `rejected` não autorizam upload. O backend valida a sessão e o vínculo diretamente no PostgreSQL antes de processar o arquivo.
- Limite de arquivo: 5 MB. Formatos permitidos: JPEG, PNG, WEBP e GIF.

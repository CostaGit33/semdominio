# Worker de imagens privadas do FutPontos

Este Worker é o único caminho de leitura dos objetos. O bucket R2 não deve ter domínio público, custom domain público nem acesso público habilitado.

## 1. Criar/selecionar o bucket

O nome esperado no `wrangler.toml` é `semdominio`. Se o bucket real tiver outro nome, altere `bucket_name` antes do deploy.

## 2. Publicar o Worker

Na pasta `r2-worker`:

```bash
npm install --save-dev wrangler
npx wrangler login
npx wrangler secret put R2_SIGNING_SECRET
npx wrangler secret put R2_INTERNAL_TOKEN
npx wrangler deploy
```

Use segredos aleatórios fortes e diferentes entre si. Configure os mesmos valores como secrets no ambiente da API. Não os coloque no Git.

## 3. Variáveis da API

```env
R2_WORKER_URL=https://semdominio-profile-images.<sua-conta>.workers.dev
R2_SIGNING_SECRET=<mesmo segredo do Worker>
R2_INTERNAL_TOKEN=<mesmo token do Worker>
R2_SIGNED_URL_TTL_SECONDS=900
```

A API precisa executar em Node.js 18 ou superior (usa `fetch` nativo).

## 4. Contrato

- Upload do cliente: mantém `POST /jogadores/:id/foto` e `POST /goleiros/:id/foto`, multipart campo `foto`.
- API → Worker: `PUT /internal/objects?key=jogadores/47.jpg`, autenticado por Bearer token.
- Remoção: `DELETE /internal/objects?key=jogadores/47.jpg`.
- Banco: guarda somente `r2://jogadores/47.jpg` ou `r2://goleiros/8.webp`.
- Respostas JSON: o campo `foto` é convertido em URL assinada por 15 minutos.
- Leitura: `GET /private/{key}?exp={unix}&sig={hmac-sha256}`.

O Worker aceita somente as pastas `jogadores/` e `goleiros/`, IDs numéricos positivos e extensões JPG, PNG, WEBP e GIF. O endpoint interno exige token e não aceita outras rotas.

## 5. Segurança

- Mantenha o bucket privado no painel R2.
- Não configure o endpoint S3 público nem exponha credenciais S3 no aplicativo.
- Guarde `R2_SIGNING_SECRET` e `R2_INTERNAL_TOKEN` como secrets tanto no Worker quanto na API.
- A URL assinada é uma credencial temporária: quem a possuir poderá ler aquela imagem até a expiração.
- A URL assinada é emitida para qualquer cliente que receba o registro da API. A autenticação/ autorização de leitura por usuário deve ser aplicada nas rotas de dados da API caso as fotos precisem ser restritas por conta, não apenas por prazo.
- Fotos antigas em `/uploads/` continuam sendo servidas pelo armazenamento legado local. Esta alteração não migra automaticamente os arquivos antigos; novos uploads passam a usar R2.

## 6. Testes após configurar os secrets

```bash
curl -i https://semdominio-profile-images.<sua-conta>.workers.dev/health
```

Depois faça upload de uma foto pelo endpoint existente e confira:
1. O banco contém uma referência `r2://...`, não URL pública.
2. A resposta da API contém URL `/private/...` com `exp` e `sig`.
3. A URL abre enquanto válida.
4. A mesma URL retorna HTTP 403 após expirar.
5. Sem assinatura, o Worker retorna HTTP 403.
6. A URL do endpoint interno sem Bearer token retorna HTTP 401.

# Place Brokers — API (`placebrokers-api`)

API da plataforma imobiliária **Place Brokers**, Projeto Integrador 4 (PI4) do curso de Sistemas para Internet da Universidade Católica de Pernambuco.

**Equipe:** Arthur Vinícius, Gabriel Soares, João Victor Varela, Sérgio Bandeira da Cruz, Sofia Viana Perez

Front-end: [PI4-Place-Brokers-Integrador-FrontEnd](https://github.com/Arthurms-dev/PI4-Place-Brokers-Integrador-FrontEnd)

## Stack

- Node.js + Express 4
- Supabase (PostgreSQL + Auth + Storage), com RLS ativo em todas as tabelas
- `multer` + `sharp` para upload e otimização de imagens
- Jest para testes

## Como rodar

```bash
cd placebrokers-api
cp .env.example .env     # preencha as chaves do Supabase (peça a quem administra o projeto)
npm install
npm run dev              # http://localhost:3333 (ou a porta em PORT)
npm test                 # testes com Jest
```

| Variável | Para quê |
| --- | --- |
| `SUPABASE_URL` | URL do projeto no Supabase |
| `SUPABASE_ANON_KEY` | chave pública (login dos usuários) |
| `SUPABASE_SERVICE_ROLE_KEY` | chave de serviço, **só no servidor**, nunca no front nem no Git |
| `PORT` | opcional, padrão `3333` |
| `NODE_ENV` | `production` no Render (liga CORS restrito e cabeçalhos HTTPS) |
| `CORS_ORIGIN` | sites que podem chamar a API, separados por vírgula (ex.: `https://placebrokers-frontend.vercel.app`) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTATO` | aviso de lead novo no celular; gere com `npx web-push generate-vapid-keys`. Sem elas, o aviso fica desligado e o resto funciona |
| `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_DRIVE_DOCUMENTOS_FOLDER_IDS` | só para os scripts de sincronização com o Google Drive (`scripts/`), rodados localmente |

## Documentação da API

- **Swagger:** com a API rodando, abra [`/docs`](https://placebrokers-api.onrender.com/docs). A especificação OpenAPI 3 fica em `/docs/openapi.json`. Para testar rotas protegidas: `POST /auth/login`, copie o `token` e clique em **Authorize**.
- **Postman / Insomnia:** importe `docs/placebrokers-api.postman_collection.json`. Rode primeiro *Autenticação → POST /auth/login*: o token é salvo na variável `{{token}}` e vale para as outras requisições. Troque `{{baseUrl}}` para `http://localhost:3333` se estiver rodando local.
- As duas saem do mesmo catálogo, `src/docs/rotas.js`. **Criou ou mudou uma rota?** Atualize esse arquivo e rode `node scripts/gerar-colecao-postman.cjs`. O teste `src/docs/rotas.test.js` falha se alguma rota do código não estiver documentada.

## Testes e CI

- `npm test` roda os testes do Jest (regras de negócio, rotas, permissões e a conferência da documentação).
- O GitHub Actions (`.github/workflows/ci.yml`) roda os testes e depois **sobe o servidor de verdade** e chama `/health` e `/docs/openapi.json`. Assim, um erro que só aparece ao iniciar (import com nome errado, por exemplo) é pego antes do deploy no Render.

## Organização

```
src/
  app.js / server.js     monta o Express e sobe o servidor
  routes/                URLs e quem pode acessar (requireRole)
  controllers/           lê a requisição e devolve a resposta
  services/              regras de negócio
  repositories/          consultas ao Supabase
  middlewares/           autenticação, cargos, sessão, limite de tentativas
  errors/                AppError e AuthError
  db/schema.sql          fotografia do banco real (NÃO EXECUTAR)
  db/migrations/         mudanças no banco, em ordem de data
scripts/                 sincronização e auditoria de documentos do Google Drive
```

Os erros seguem o formato `{ error: { code, message, fieldErrors } }` (vendas usa `{ code, message, fieldErrors }`; o front aceita os dois).

## Cargos

| Cargo | Como é criado | O que acessa |
| --- | --- | --- |
| `admin` | pelos devs, direto no Supabase | tudo |
| `gerente` | pelo admin | equipe, leads, agendamentos e vendas da sua equipe; confirma vendas |
| `corretor` | cadastro próprio + aprovação do admin (corretor externo precisa de CRECI) | seus leads, clientes, agendamentos e vendas |
| `viabilizador` | fora do MVP | produtos e oportunidades |

## Endpoints

Todas as rotas, exceto as públicas, pedem `Authorization: Bearer <token>`. A lista completa, com exemplos de corpo, está no Swagger (`/docs`).

| Recurso | Rotas | Quem |
| --- | --- | --- |
| `/auth` | `POST /login`, `POST /register`, `GET /me`, `PATCH /me`, `PATCH /senha` | público / logado |
| `/empreendimentos` | `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `POST /:id/imagens/capa`, `POST /:id/imagens/galeria`, `DELETE /:id/imagens/:imagemId`, `POST /:id/tipologias`, `PATCH /:id/tipologias/:tipologiaId`, `GET /:id/documentos`, `GET /:id/documentos/:tipo`, `GET /:id/documentos/arquivo/:docId`, `GET/POST /:id/documentos/admin`, `PATCH /:id/documentos/admin/:docId`, `GET /documentos/pendencias` | catálogo público; documentos para admin, gerente e corretor; edição admin |
| `/construtoras` | `GET /`, `POST /` | leitura / admin |
| `/leads` | `POST /` (formulário do site), `GET /`, `GET /meus`, `GET /retornos`, `PATCH /:id/status`, `PATCH /:id/corretor`, `POST /:id/converter`, `POST /:id/cliente`, `GET/POST /:id/atividades` | público (criar) / admin / corretor |
| `/roleta` | `GET /hoje`, `POST /chegada`, `PATCH/DELETE /chegada/:corretorId`, `POST /iniciar`, `POST /distribuir`, `GET /minha`, `GET /focos`, `PUT /focos/:corretorId` | recepção (admin) / corretor / gerente (focos da equipe) |
| `/clientes` | `GET /`, `GET /:id`, `POST /`, `PATCH /:id` | admin, corretor (só a própria carteira) |
| `/agendamentos` | `GET /`, `POST /`, `PATCH /:id/data`, `PATCH /:id/status` | admin, corretor (só os seus) |
| `/vendas` | `POST /`, `GET /`, `PATCH /:id`, `GET /vgv` | corretor registra; gerente/admin confirmam |
| `/equipe` | `GET /`, `PATCH /:id`, `POST /gerentes`, `GET/POST /times`, `PATCH/DELETE /times/:id`, `GET/POST /diretorias` | admin |
| `/gerente` | `GET /equipe`, `GET /leads`, `GET /agendamentos`, `GET /desempenho`, `PATCH /leads/:id/corretor` | gerente (só a própria equipe) |
| `/corretores` | `GET /` | admin |
| `/metricas` | `POST /eventos`, `GET /meus-acessos`, `GET /dashboard` | público (eventos) / logado / admin |
| `/painel` | `GET /avisos-seguranca`, `GET/POST /melhorias`, `GET /modificacoes` | admin |
| `/notificacoes` | `GET /chave`, `POST /inscricao`, `DELETE /inscricao` | público (chave) / logado |
| `/viabilizador` | `GET /produtos`, `PATCH /produtos/:id`, `POST /produtos/:id/documentos/:tipo`, `GET /oportunidades` | viabilizador (pós-MVP) |
| sistema | `GET /health`, `GET /docs`, `GET /docs/openapi.json` | público |

## Banco de dados

- `src/db/schema.sql` é só **referência** do banco real (18 tabelas, 8 enums, RLS 18/18). Todos os comandos estão comentados de propósito.
- Para mudar o banco, crie `src/db/migrations/AAAAMMDD_descricao.sql`, rode no SQL Editor do Supabase e avise a equipe no Trello.
- Regras que precisam ser atômicas ficam em funções no banco (`SECURITY DEFINER`, só o back chama): `registrar_lead_site` (mesmo e-mail ou telefone = mesmo lead), conversão de lead em cliente, `roleta_registrar_chegada` e `roleta_distribuir`.
- A distribuição da roleta também roda sozinha a cada 2 minutos, de segunda a sábado das 09h às 18h, pelo `pg_cron` do Supabase (`20261029_roleta_agendada.sql`).

## Fluxos principais

- **Lead:** formulário "Falar com especialista" → lead sem corretor → roleta entrega ao próximo corretor apto com foco no empreendimento (ou o admin atribui) → corretor liga/chama no WhatsApp pelo app → converte em cliente (conversão atômica via RPC).
- **Roleta:** a recepção marca a chegada (lista geral do dia; apto quem chega antes das 09h) → a lista fecha às 09h → cada lead vai para o próximo apto com foco no empreendimento, voltando ao início da lista no fim. Funciona das 07h (08h no sábado) às 18h; domingo e fora do horário o lead espera o próximo dia. Sem corretor com foco, o lead fica com o admin.
- **Atendimento:** lead novo há 15 min sem ligação nem WhatsApp aparece para o gerente, que repassa manualmente (o repasse reinicia o tempo). O gerente vê o tempo de resposta de cada corretor (`GET /gerente/desempenho`).
- **Agendamento:** `agendado → confirmado → realizado | nao_compareceu | cancelado` (cancelar pede motivo). O corretor só agenda para clientes da própria carteira.
- **Venda / VGV:** corretor registra → gerente confirma → só então conta no VGV do admin.

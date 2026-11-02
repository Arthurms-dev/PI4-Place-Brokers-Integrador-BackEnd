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
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTATO` | aviso de lead novo no celular pelo site; gere com `npx web-push generate-vapid-keys`. Sem elas, o aviso pelo site fica desligado e o resto funciona |
| `EXPO_PUSH`, `EXPO_ACCESS_TOKEN` | aviso de lead novo no app React Native (Expo). Liga sozinho; `EXPO_PUSH=false` desliga. O token de acesso só é preciso se o projeto do Expo exigir |
| `RESEND_API_KEY` | envio do e-mail "Esqueci minha senha" pelo [Resend](https://resend.com). Sem ela, em desenvolvimento o link aparece no terminal do back; em produção nada é enviado |
| `EMAIL_REMETENTE` | remetente dos e-mails, ex.: `Place Brokers <nao-responda@placebrokers.com.br>` (o domínio precisa estar verificado no Resend) |
| `SITE_URL` | endereço do site usado no link do e-mail (ex.: `https://placebrokers-frontend.vercel.app`). Se faltar, usa o primeiro `CORS_ORIGIN` |
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
| `/auth` | `POST /login` (devolve `token` de 1 hora e `refreshToken`), `POST /renovar`, `POST /register`, `POST /esqueci-senha`, `POST /redefinir-senha`, `GET /me`, `PATCH /me`, `PATCH /senha` | público / logado |
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

- `src/db/schema.sql` é só **referência**: a fotografia do banco em 26/10 (18 tabelas, 8 enums). Todos os comandos estão comentados de propósito. As migrações de `src/db/migrations/` vieram depois; hoje são 24 tabelas, todas com RLS.
- Para mudar o banco, crie `src/db/migrations/AAAAMMDD_descricao.sql`, rode no SQL Editor do Supabase e avise a equipe no Trello.
- Regras que precisam ser atômicas ficam em funções no banco (`SECURITY DEFINER`, só o back chama): `registrar_lead_site` (mesmo e-mail ou telefone = mesmo lead), conversão de lead em cliente, `roleta_registrar_chegada` e `roleta_distribuir`.
- A distribuição da roleta também roda sozinha a cada 2 minutos, de segunda a sábado das 09h às 18h, pelo `pg_cron` do Supabase (`20261029_roleta_agendada.sql`).
- **A API é a única porta do banco** (`20261102_api_unica_porta.sql`): as funções `anon` e `authenticated` do Supabase não leem nem gravam nenhuma tabela. O site e o app falam só com a API, que usa a `service_role` no servidor. Isso impede, por exemplo, ler o link dos books e tabelas ou criar lead sem passar pelo antispam usando a chave pública. Tabela nova criada no SQL Editor deve receber `REVOKE ALL ... FROM anon, authenticated`.
- Miniatura das capas (640 px) para os cards: gerada no upload da capa; para as antigas, rode `node scripts/gerar-miniaturas.cjs --simular` e depois sem `--simular`.

## Avisos de segurança

Aparecem no painel do admin (aba "Avisos de segurança"). O mesmo aviso não se repete por 30 minutos e o IP aparece mascarado.

| Aviso | Quando | Nível |
| --- | --- | --- |
| Tentativas de login falhas | mais de 3 senhas erradas para o mesmo e-mail em 15 min | atenção |
| Login bloqueado por excesso de tentativas | o limite de 5 erros por e-mail ou 30 por conexão foi atingido | crítico |
| Conta bloqueada tentou entrar | conta desativada ou recusada acertou a senha | info |
| Senha alterada / Senha redefinida por e-mail | troca em Configurações ou pelo "Esqueci minha senha" | info |
| Tentativas de abrir área sem permissão | 5 acessos negados do mesmo usuário em 10 min | atenção |
| Muitos books e tabelas abertos | 20 documentos comerciais do mesmo usuário em 10 min | atenção |
| Robô tentando enviar o formulário | 3 envios barrados pelo antispam da mesma conexão em 1 h | info |
| Novo administrador criado / Usuário virou administrador | direto no banco, por qualquer caminho | crítico |
| Cargo alterado, Acesso desativado/reativado, Cadastro recusado foi aprovado | direto no banco (`20261102_avisos_seguranca.sql`) | atenção / info |

Código: `src/services/avisosSeguranca.js` (eventos da API) e o gatilho `profiles_avisos_seguranca` (mudanças de cargo e acesso).

## E-mail (Resend)

Configuração feita uma vez por quem administra o projeto. A chave nunca vai para o Git nem para o grupo.

1. Crie a conta em [resend.com](https://resend.com) (plano grátis: 3.000 e-mails/mês, 100 por dia).
2. Em **Domains**, adicione o domínio da Place (ex.: `placebrokers.com.br`) e crie no DNS os registros que o Resend mostrar (SPF/DKIM). Espere ficar *Verified*.
3. Em **API Keys**, crie uma chave com permissão *Sending access* e cole direto no Render (Environment) como `RESEND_API_KEY`.
4. No Render, defina também `EMAIL_REMETENTE` e `SITE_URL` e faça o deploy.
5. Teste em `/esqueci-senha` no site com um e-mail da equipe.

Antes de verificar o domínio dá para testar com o remetente `onboarding@resend.dev`, mas o Resend só entrega para o e-mail da própria conta.

## Fluxos principais

- **Lead:** formulário "Falar com especialista" → lead sem corretor → roleta entrega ao próximo corretor apto com foco no empreendimento (ou o admin atribui) → corretor liga/chama no WhatsApp pelo app → converte em cliente (conversão atômica via RPC).
- **Roleta:** a recepção marca a chegada (lista geral do dia; apto quem chega antes das 09h) → a lista fecha às 09h → cada lead vai para o próximo apto com foco no empreendimento, voltando ao início da lista no fim. Funciona das 07h (08h no sábado) às 18h; domingo e fora do horário o lead espera o próximo dia. Sem corretor com foco, o lead fica com o admin.
- **Atendimento:** lead novo há 15 min sem ligação nem WhatsApp aparece para o gerente, que repassa manualmente (o repasse reinicia o tempo). O gerente vê o tempo de resposta de cada corretor (`GET /gerente/desempenho`).
- **Esqueci minha senha:** `POST /auth/esqueci-senha` responde sempre a mesma mensagem (não revela se o e-mail existe) e, em segundo plano, gera o token de recuperação no Supabase Auth e manda o e-mail pelo Resend com o link `SITE_URL/redefinir-senha?token=...` → no site, a pessoa cria a senha nova (`POST /auth/redefinir-senha`). O token vale 1 hora e uma vez só; a troca encerra as outras sessões e cria o aviso de segurança "Senha redefinida por e-mail" no painel do admin.
- **Agendamento:** `agendado → confirmado → realizado | nao_compareceu | cancelado` (cancelar pede motivo). O corretor só agenda para clientes da própria carteira.
- **Venda / VGV:** corretor registra → gerente confirma → só então conta no VGV do admin.

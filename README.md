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
cp .env.esample .env     # preencha as chaves do Supabase (peça a quem administra o projeto)
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

Todas as rotas, exceto as públicas, pedem `Authorization: Bearer <token>`.

| Recurso | Rotas | Quem |
| --- | --- | --- |
| `/auth` | `POST /login`, `POST /register`, `GET /me`, `PATCH /me`, `PATCH /senha` | público / logado |
| `/empreendimentos` | `GET /`, `GET /:id`, `PATCH /:id`, `GET /:id/documentos`, `GET /:id/documentos/:tipo`, `GET /:id/documentos/arquivo/:docId`, `POST /:id/imagens/capa`, `POST /:id/imagens/galeria`, `DELETE /:id/imagens/:imagemId`, `POST /:id/tipologias`, `PATCH /:id/tipologias/:tipologiaId`, `GET/POST /:id/documentos/admin`, `PATCH /:id/documentos/admin/:docId`, `GET /documentos/pendencias` | catálogo público; edição e documentos admin |
| `/construtoras` | `GET /`, `POST /` | leitura / admin |
| `/leads` | `POST /` (formulário do site), `GET /`, `GET /meus`, `PATCH /:id/status`, `PATCH /:id/corretor`, `POST /:id/converter`, `GET/POST /:id/atividades` | público (criar) / admin / corretor |
| `/clientes` | `GET /`, `GET /:id`, `POST /`, `PATCH /:id` | admin, corretor (só a própria carteira) |
| `/agendamentos` | `GET /`, `POST /`, `PATCH /:id/data`, `PATCH /:id/status` | admin, corretor (só os seus) |
| `/vendas` | `POST /`, `GET /`, `PATCH /:id`, `GET /vgv` | corretor registra; gerente/admin confirmam |
| `/equipe` | `GET /`, `PATCH /:id`, `POST /gerentes`, `GET/POST /times`, `PATCH/DELETE /times/:id`, `GET/POST /diretorias` | admin |
| `/gerente` | `GET /equipe`, `GET /leads`, `GET /agendamentos`, `PATCH /leads/:id/corretor` | gerente |
| `/corretores` | `GET /` | admin |
| `/metricas` | `POST /eventos`, `GET /dashboard` | público (eventos) / admin |
| `/painel` | `GET /avisos-seguranca`, `GET /melhorias`, `GET /modificacoes` | admin |
| `/viabilizador` | `GET /produtos`, `PATCH /produtos/:id`, `POST /produtos/:id/documentos/:tipo`, `GET /oportunidades` | viabilizador (pós-MVP) |

## Banco de dados

- `src/db/schema.sql` é só **referência** do banco real (18 tabelas, 8 enums, RLS 18/18). Todos os comandos estão comentados de propósito.
- Para mudar o banco, crie `src/db/migrations/AAAAMMDD_descricao.sql`, rode no SQL Editor do Supabase e avise a equipe no Trello.

## Fluxos principais

- **Lead:** formulário "Falar com especialista" → lead sem corretor → admin distribui → corretor atende → converte em cliente (conversão atômica via RPC).
- **Agendamento:** `agendado → confirmado → realizado | nao_compareceu | cancelado` (cancelar pede motivo). O corretor só agenda para clientes da própria carteira.
- **Venda / VGV:** corretor registra → gerente confirma → só então conta no VGV do admin.

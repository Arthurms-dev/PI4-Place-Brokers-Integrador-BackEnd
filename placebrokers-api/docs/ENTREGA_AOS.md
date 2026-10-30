# Entrega acadêmica AOS — Place Brokers (Express + PostgreSQL)

## Estado inspecionado em 30/10/2026

A API existente utiliza **Express 4** e **PostgreSQL por meio do Supabase**. A arquitetura está separada em `routes/`, `controllers/`, `services/` e `repositories/`. **Não há razão para recriar o back-end** para essa entrega.

## Rodar e demonstrar

```bash
cd placebrokers-api
cp .env.example .env          # configurar as credenciais apenas localmente
npm ci
npm test -- --runInBand
npm run dev                    # http://localhost:3333
# Em outro terminal:
curl -f http://localhost:3333/health
curl -f http://localhost:3333/docs/openapi.json
```

- API OpenAPI 3: `GET /docs/openapi.json`.
- Swagger UI: `GET /docs`.
- Postman/Insomnia: importar `docs/placebrokers-api.postman_collection.json` (já existe).
- Autenticação: `POST /auth/login`; adicionar o Bearer token às requisições protegidas.
- Para reproduzir o teste de subida sem banco real: consultar `.github/workflows/ci.yml` na raiz do repositório.
- README principal contém variáveis, arquitetura, endpoints e papéis. **A lista completa de rotas está em `src/docs/rotas.js`** e o teste `src/docs/rotas.test.js` compara rotas do código, OpenAPI e Postman.

## Roteiro de apresentação (sugestão)

1. Explicar o problema da gestão de imóveis, leads, corretores, agendamentos e vendas.
2. Mostrar Express, camadas e o PostgreSQL/Supabase; nunca projetar credenciais em tela.
3. Abrir `/health` e `/docs`; explicar uma rota pública e uma protegida.
4. Fazer login com **usuário de demonstração autorizado**; criar lead de teste em ambiente de homologação, consultar o resultado e mostrar as validações.
5. Mostrar testes (`npm test`), documentação Postman e CI.
6. Explicar segurança: autenticação, permissões, RLS e tratamento padronizado dos erros.
7. Concluir com limitações e próximos passos: auditoria dos dados demo e validação funcional das telas.

## Checklist acadêmico

- [x] Estrutura Express + PostgreSQL identificada.
- [x] README com configuração e lista de endpoints existente.
- [x] Swagger/OpenAPI e coleção Postman existentes.
- [x] Jest e GitHub Actions CI existentes.
- [ ] Executar testes no ambiente do grupo e corrigir falhas encontradas.
- [ ] Conferir enunciado/rubrica da disciplina AOS com o professor.
- [ ] Ensaiar demonstração autenticada com credenciais e banco de teste.
- [ ] Validar dump do banco e limpar dados demo após autorização do João.

**Importante:** `src/db/schema.sql` é uma fotografia documental comentada, não é um script de inicialização nem backup. Não executá-lo como migração.

'use strict';

const { ROTAS, GRUPOS } = require('./rotas');
const { version } = require('../../package.json');

const ERRO = {
  type: 'object',
  properties: {
    code: { type: 'string', example: 'VALIDATION_ERROR' },
    message: { type: 'string', example: 'Verifique os campos destacados.' },
    fieldErrors: { type: 'object', additionalProperties: { type: 'string' }, example: { email: 'E-mail inválido.' } },
  },
};

/** "/leads/:id/status" -> "/leads/{id}/status" */
const paraOpenApi = (caminho) => caminho.replace(/:(\w+)/g, '{$1}');

function descricaoAcesso(acesso) {
  if (acesso === 'publico') return 'Acesso: público.';
  if (acesso === 'logado') return 'Acesso: qualquer usuário logado.';
  return `Acesso: ${acesso.join(', ')}.`;
}

/** Especificação OpenAPI 3.0 montada a partir do catálogo de rotas. */
function gerarOpenApi({ servidor } = {}) {
  const paths = {};
  for (const r of ROTAS) {
    const caminho = paraOpenApi(r.caminho);
    const parametros = [...r.caminho.matchAll(/:(\w+)/g)].map(([, nome]) => ({
      name: nome, in: 'path', required: true, schema: { type: 'string' },
    }));
    for (const [nome, descricao] of Object.entries(r.consulta ?? {})) {
      parametros.push({ name: nome, in: 'query', required: false, description: descricao, schema: { type: 'string' } });
    }
    const operacao = {
      tags: [r.grupo],
      summary: r.resumo,
      description: [descricaoAcesso(r.acesso), r.obs].filter(Boolean).join(' '),
      operationId: `${r.metodo}${caminho.replace(/[{}]/g, '').replace(/\/(\w)/g, (_, c) => c.toUpperCase()).replace(/[^\w]/g, '')}`,
      ...(parametros.length ? { parameters: parametros } : {}),
      ...(r.acesso === 'publico' ? { security: [] } : {}),
      responses: {
        200: { description: 'Sucesso' },
        400: { description: 'Dados inválidos', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } } },
        ...(r.acesso === 'publico' ? {} : {
          401: { description: 'Sem token ou sessão expirada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } } },
          403: { description: 'Cargo sem permissão', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } } },
        }),
      },
    };
    if (r.corpo) {
      operacao.requestBody = { required: true, content: { 'application/json': { schema: { type: 'object' }, example: r.corpo } } };
    } else if (r.multipart) {
      operacao.requestBody = { required: true, content: { 'multipart/form-data': { schema: { type: 'object' } } } };
    }
    paths[caminho] = { ...(paths[caminho] ?? {}), [r.metodo]: operacao };
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'Place Brokers API',
      version,
      description:
        'API da plataforma imobiliária Place Brokers (PI4 — Sistemas para Internet, UNICAP). ' +
        'Node.js + Express em camadas (rotas → controllers → services → repositories) sobre PostgreSQL (Supabase). ' +
        'Para rotas protegidas: faça POST /auth/login, copie o token e use o botão Authorize.',
    },
    servers: [{ url: servidor || '/' }],
    tags: Object.entries(GRUPOS).map(([name, description]) => ({ name, description })),
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
      schemas: { Erro: ERRO },
    },
    security: [{ bearer: [] }],
    paths,
  };
}

const PAGINA = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Place Brokers API — documentação</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css" />
</head>
<body>
  <div id="swagger"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.ui = SwaggerUIBundle({ url: "/docs/openapi.json", dom_id: "#swagger", persistAuthorization: true });
  </script>
</body>
</html>`;

/** Rotas /docs (página do Swagger UI) e /docs/openapi.json. */
function montarDocs(app) {
  let cache = null;
  app.get('/docs/openapi.json', (req, res) => {
    cache = cache ?? gerarOpenApi();
    res.json(cache);
  });
  app.get('/docs', (req, res) => {
    res.type('html').send(PAGINA);
  });
}

module.exports = { gerarOpenApi, montarDocs, paraOpenApi };

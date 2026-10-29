'use strict';

// Garante que a documentação (/docs) e a coleção do Postman listam exatamente as rotas
// que existem no código. Se você criou uma rota nova, acrescente em src/docs/rotas.js.
const fs = require('fs');
const path = require('path');
const { ROTAS } = require('./rotas');
const { gerarOpenApi } = require('./openapi');

const SRC = path.join(__dirname, '..');

function rotasDoCodigo() {
  const app = fs.readFileSync(path.join(SRC, 'app.js'), 'utf8');
  const montagens = {};
  for (const [, prefixo, variavel] of app.matchAll(/app\.use\('([^']+)',\s*(\w+)\)/g)) montagens[variavel] = prefixo;
  const arquivos = {};
  for (const [, variavel, arquivo] of app.matchAll(/const (\w+) = require\('\.\/routes\/([^']+)'\)/g)) arquivos[variavel] = arquivo;

  const encontradas = new Set();
  for (const [, metodo, caminho] of app.matchAll(/app\.(get|post|put|patch|delete)\('([^']+)'/g)) encontradas.add(`${metodo} ${caminho}`);
  // Rotas registradas por montarDocs(app)
  encontradas.add('get /docs');
  encontradas.add('get /docs/openapi.json');

  for (const [variavel, prefixo] of Object.entries(montagens)) {
    const arquivo = arquivos[variavel];
    if (!arquivo) continue;
    const fonte = fs.readFileSync(path.join(SRC, 'routes', arquivo.endsWith('.js') ? arquivo : `${arquivo}.js`), 'utf8');
    for (const [, metodo, caminho] of fonte.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) {
      encontradas.add(`${metodo} ${caminho === '/' ? prefixo : prefixo + caminho}`);
    }
  }
  return encontradas;
}

describe('documentação da API', () => {
  test('toda rota do código está documentada e vice-versa', () => {
    const codigo = rotasDoCodigo();
    const documentadas = new Set(ROTAS.map((r) => `${r.metodo} ${r.caminho}`));
    const semDoc = [...codigo].filter((r) => !documentadas.has(r));
    const sobrando = [...documentadas].filter((r) => !codigo.has(r));
    expect({ semDoc, sobrando }).toEqual({ semDoc: [], sobrando: [] });
  });

  test('a especificação OpenAPI tem as operações e um id único para cada uma', () => {
    const spec = gerarOpenApi();
    const ids = Object.values(spec.paths).flatMap((ops) => Object.values(ops).map((o) => o.operationId));
    expect(ids.length).toBe(ROTAS.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect(spec.paths['/leads/{id}/status'].patch.parameters[0]).toMatchObject({ name: 'id', in: 'path' });
  });

  test('a coleção do Postman está atualizada (rode node scripts/gerar-colecao-postman.cjs)', () => {
    const colecao = JSON.parse(fs.readFileSync(path.join(SRC, '..', 'docs', 'placebrokers-api.postman_collection.json'), 'utf8'));
    const naColecao = colecao.item.flatMap((g) => g.item.map((i) => i.name.split(' — ')[0])).sort();
    const noCatalogo = ROTAS.map((r) => `${r.metodo.toUpperCase()} ${r.caminho}`).sort();
    expect(naColecao).toEqual(noCatalogo);
  });
});

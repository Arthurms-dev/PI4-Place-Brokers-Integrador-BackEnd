#!/usr/bin/env node
'use strict';

// Gera a coleção do Postman/Insomnia a partir do catálogo de rotas (src/docs/rotas.js).
// Uso: node scripts/gerar-colecao-postman.cjs   (grava docs/placebrokers-api.postman_collection.json)
// Rode de novo sempre que mudar alguma rota.

const fs = require('fs');
const path = require('path');
const { ROTAS, GRUPOS } = require('../src/docs/rotas');

const SAIDA = path.join(__dirname, '..', 'docs', 'placebrokers-api.postman_collection.json');

function requisicao(r) {
  // :id vira {{id}}, :corretorId vira {{corretorId}}... (variáveis da coleção)
  const caminho = r.caminho.replace(/:(\w+)/g, '{{$1}}');
  const consulta = Object.entries(r.consulta ?? {}).map(([key, description]) => ({ key, value: '', description, disabled: true }));
  const item = {
    name: `${r.metodo.toUpperCase()} ${r.caminho} — ${r.resumo}`,
    request: {
      method: r.metodo.toUpperCase(),
      header: [],
      url: {
        raw: `{{baseUrl}}${caminho}`,
        host: ['{{baseUrl}}'],
        path: caminho.split('/').filter(Boolean),
        ...(consulta.length ? { query: consulta } : {}),
      },
      description: r.acesso === 'publico' ? 'Público' : r.acesso === 'logado' ? 'Qualquer usuário logado' : `Cargos: ${r.acesso.join(', ')}`,
      ...(r.acesso === 'publico' ? { auth: { type: 'noauth' } } : {}),
    },
  };
  if (r.corpo) {
    item.request.header.push({ key: 'Content-Type', value: 'application/json' });
    item.request.body = { mode: 'raw', raw: JSON.stringify(r.corpo, null, 2), options: { raw: { language: 'json' } } };
  } else if (r.multipart) {
    item.request.body = { mode: 'formdata', formdata: [] };
  }
  if (r.caminho === '/auth/login') {
    // Guarda o token do login para as próximas requisições.
    item.event = [{
      listen: 'test',
      script: { type: 'text/javascript', exec: [
        'const corpo = pm.response.json();',
        'if (corpo.token) { pm.collectionVariables.set("token", corpo.token); console.log("Token salvo"); }',
      ] },
    }];
  }
  return item;
}

const variaveisDeCaminho = [...new Set(ROTAS.flatMap((r) => [...r.caminho.matchAll(/:(\w+)/g)].map(([, v]) => v)))];

const colecao = {
  info: {
    name: 'Place Brokers API',
    description: 'Gerada de src/docs/rotas.js. Comece por Autenticação → POST /auth/login: o token fica salvo na variável {{token}}.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] },
  variable: [
    { key: 'baseUrl', value: 'https://placebrokers-api.onrender.com' },
    { key: 'token', value: '' },
    ...variaveisDeCaminho.map((key) => ({ key, value: '' })),
  ],
  item: Object.keys(GRUPOS)
    .map((grupo) => ({ name: grupo, description: GRUPOS[grupo], item: ROTAS.filter((r) => r.grupo === grupo).map(requisicao) }))
    .filter((g) => g.item.length),
};

fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
fs.writeFileSync(SAIDA, `${JSON.stringify(colecao, null, 2)}\n`);
console.log(`Coleção gravada em ${path.relative(process.cwd(), SAIDA)} (${ROTAS.length} requisições).`);

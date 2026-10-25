'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { listarArvoreDrive, exigirVarreduraCompleta } = require('./drive-arvore.cjs');
const { prepararPendencias } = require('./drive-pendencias.cjs');

const ROOT = 'PASTA_PLACE_001';
const DESTINO = 'PASTA_CONSTRUTORA_001';
const SUB = 'PASTA_EMPREENDIMENTO_001';
const PDF = 'ARQUIVO_TABELA_001';
const FOLDER = 'application/vnd.google-apps.folder';
const SHORTCUT = 'application/vnd.google-apps.shortcut';
const pasta = (id, name = id) => ({ id, name, mimeType: FOLDER });
const foto = { id: 'FOTO_FACHADA_001', name: 'Fachada.jpg', mimeType: 'image/jpeg', modifiedTime: '2026-10-25T10:00:00Z' };
const pdf = { id: PDF, name: 'Tabela outubro.pdf', mimeType: 'application/pdf', modifiedTime: '2026-10-25T10:00:00Z', parents: [SUB] };
const atalho = (id, destino, extras = {}) => ({ id, name: 'Atalho da Place', mimeType: SHORTCUT,
  modifiedTime: '2026-01-01T00:00:00Z', shortcutDetails: { targetId: destino, targetMimeType: FOLDER, ...extras } });

function ambiente({ conteudo = {}, metadados = {}, respostas = {} } = {}) {
  const chamadas = [];
  const metas = { [ROOT]: pasta(ROOT, 'Place'), [DESTINO]: pasta(DESTINO, 'Construtora'), [SUB]: pasta(SUB, 'Brisa do Mar'), [PDF]: pdf, ...metadados };
  async function fetchImpl(endereco, opcoes) {
    const url = new URL(endereco);
    chamadas.push({ url, opcoes });
    assert.equal(url.origin, 'https://www.googleapis.com');
    assert.equal(opcoes.method, 'GET');
    assert.equal(opcoes.headers.Authorization, 'Bearer token-de-teste');
    assert.equal(url.searchParams.get('supportsAllDrives'), 'true');
    const id = url.pathname === '/drive/v3/files'
      ? /^'([^']+)' in parents and trashed = false$/.exec(url.searchParams.get('q'))?.[1]
      : url.pathname.split('/').at(-1);
    const tipo = url.pathname === '/drive/v3/files' ? 'lista' : 'meta';
    const custom = respostas[`${tipo}:${id}`];
    if (custom instanceof Error) throw custom;
    if (custom) return { ok: (custom.status ?? 200) === 200, status: custom.status ?? 200, json: async () => custom.dados };
    if (tipo === 'meta') {
      const data = metas[id];
      return { ok: Boolean(data), status: data ? 200 : 404, json: async () => data };
    }
    assert.equal(url.searchParams.get('includeItemsFromAllDrives'), 'true');
    assert.match(url.searchParams.get('fields'), /shortcutDetails/);
    const paginas = conteudo[id] ?? [[]];
    const pagina = Number(url.searchParams.get('pageToken') ?? 0);
    return { ok: true, status: 200, json: async () => ({ files: paginas[pagina],
      ...(pagina + 1 < paginas.length ? { nextPageToken: String(pagina + 1) } : {}) }) };
  }
  return { chamadas, executar: (extras = {}) => listarArvoreDrive({ pastas: [ROOT], token: 'token-de-teste', fetchImpl, ...extras }) };
}

test('percorre Place, atalho da construtora e subpastas de empreendimentos', async () => {
  const a = ambiente({ conteudo: { [ROOT]: [[atalho('ATALHO_PLACE_001', DESTINO)]],
    [DESTINO]: [[pasta(SUB)]], [SUB]: [[pdf, foto]] } });
  const r = await a.executar();
  assert.equal(r.completo, true);
  assert.equal(r.resumo.pastas, 3);
  assert.equal(r.resumo.atalhos, 1);
  assert.equal(r.arquivos.length, 2);
  assert.equal(r.arquivos.find((f) => f.id === PDF).pastaId, SUB);
  assert.ok(r.arquivos.find((f) => f.id === PDF).caminho.includes('Construtora'));
});

test('usa ID e data do PDF original, não os do atalho', async () => {
  const a = ambiente({ conteudo: { [ROOT]: [[atalho('ATALHO_TABELA_001', PDF)]] } });
  const r = await a.executar();
  assert.equal(r.arquivos[0].id, PDF);
  assert.equal(r.arquivos[0].modifiedTime, pdf.modifiedTime);
  const doc = { id: 'doc-1', empreendimento_id: 'emp-1', drive_file_id: PDF, tipo: 'tabela', fase: 'Fase 1', status: 'aprovado', fonte_atualizada_em: '2026-09-01T00:00:00Z' };
  const pendencias = prepararPendencias({ arquivos: r.arquivos, documentos: [doc] }).pendencias;
  assert.equal(pendencias[0].motivo, 'ARQUIVO_MODIFICADO');
  assert.equal(pendencias[0].fase, 'Fase 1');
  assert.equal(doc.status, 'aprovado');
});

test('deduplica arquivo direto e dois atalhos para o mesmo original', async () => {
  const a = ambiente({ conteudo: { [ROOT]: [[pdf, atalho('ATALHO_TABELA_001', PDF), atalho('ATALHO_TABELA_002', PDF)]] } });
  const r = await a.executar();
  assert.equal(r.arquivos.length, 1);
  assert.equal(a.chamadas.filter((c) => c.url.pathname.endsWith(`/${PDF}`)).length, 1);
});

test('atalhos repetidos para pastas e volta à pasta raiz não causam loop', async () => {
  const a = ambiente({ conteudo: { [ROOT]: [[atalho('ATALHO_PASTA_001', DESTINO), atalho('ATALHO_PASTA_002', DESTINO)]],
    [DESTINO]: [[pdf, atalho('ATALHO_VOLTA_001', ROOT)]] } });
  const r = await a.executar();
  assert.equal(r.completo, true);
  assert.equal(r.resumo.pastas, 2);
  assert.equal(a.chamadas.filter((c) => c.url.searchParams.get('q')?.startsWith(`'${DESTINO}'`)).length, 1);
});

test('percorre páginas inclusive quando uma página intermediária está vazia', async () => {
  const a = ambiente({ conteudo: { [ROOT]: [[foto], [], [pdf]] } });
  const r = await a.executar();
  assert.equal(r.arquivos.length, 2);
  assert.equal(a.chamadas.filter((c) => c.url.pathname === '/drive/v3/files').length, 3);
});

test('encaminha resource key do alvo em cabeçalho e não a inclui no resultado', async () => {
  const a = ambiente({ conteudo: { [ROOT]: [[atalho('ATALHO_CHAVE_001', DESTINO, { targetResourceKey: 'chave-de-recurso' })]], [DESTINO]: [[pdf]] } });
  const r = await a.executar();
  const alvo = a.chamadas.find((c) => c.url.pathname.endsWith(`/${DESTINO}`));
  const lista = a.chamadas.find((c) => c.url.searchParams.get('q')?.startsWith(`'${DESTINO}'`));
  assert.equal(alvo.opcoes.headers['X-Goog-Drive-Resource-Keys'], `${DESTINO}/chave-de-recurso`);
  assert.equal(lista.opcoes.headers['X-Goog-Drive-Resource-Keys'], `${DESTINO}/chave-de-recurso`);
  assert.doesNotMatch(JSON.stringify(r), /chave-de-recurso|token-de-teste/);
});

for (const status of [403, 404]) {
  test(`destino HTTP ${status} sinaliza leitura parcial e bloqueia registro`, async () => {
    const a = ambiente({ conteudo: { [ROOT]: [[foto, atalho('ATALHO_PRIVADO_001', DESTINO)]] }, respostas: { [`meta:${DESTINO}`]: { status } } });
    const r = await a.executar();
    assert.equal(r.completo, false);
    assert.equal(r.arquivos.length, 1);
    assert.equal(r.avisos[0].codigo, 'DESTINO_INACESSIVEL');
    assert.throws(() => exigirVarreduraCompleta(r), /Nenhuma pendência foi gravada/);
    assert.doesNotMatch(JSON.stringify(r), /"excluido"/);
  });
}

test('confere acesso à pasta raiz, mesmo se files.list retornasse vazio', async () => {
  const a = ambiente({ respostas: { [`meta:${ROOT}`]: { status: 404 } } });
  const r = await a.executar();
  assert.equal(r.completo, false);
  assert.equal(r.avisos[0].codigo, 'ORIGEM_INACESSIVEL');
  assert.equal(a.chamadas.length, 1);
});

test('lista de pasta sem permissão não passa como acervo vazio', async () => {
  const a = ambiente({ respostas: { [`lista:${ROOT}`]: { status: 403 } } });
  const r = await a.executar();
  assert.equal(r.completo, false);
  assert.equal(r.avisos[0].codigo, 'PASTA_INACESSIVEL');
});

test('atalho sem targetId e destino na lixeira geram avisos', async () => {
  const a = ambiente({ conteudo: { [ROOT]: [[atalho('ATALHO_SEM_ALVO_001', undefined), atalho('ATALHO_LIXEIRA_001', PDF)]] }, metadados: { [PDF]: { ...pdf, trashed: true } } });
  const r = await a.executar();
  assert.equal(r.completo, false);
  assert.deepEqual(r.avisos.map((v) => v.codigo), ['ATALHO_SEM_DESTINO', 'DESTINO_INVALIDO']);
});

test('metadados atuais prevalecem sobre targetMimeType antigo do atalho', async () => {
  const a = ambiente({ conteudo: { [ROOT]: [[atalho('ATALHO_TABELA_001', PDF)]] } });
  const r = await a.executar();
  assert.equal(r.arquivos[0].mimeType, 'application/pdf');
});

test('interrompe ciclo entre dois atalhos sem travar a varredura', async () => {
  const A = 'ATALHO_CICLO_A_001', B = 'ATALHO_CICLO_B_001';
  const a = ambiente({ conteudo: { [ROOT]: [[atalho(A, B)]] }, metadados: { [A]: atalho(A, B), [B]: atalho(B, A) } });
  const r = await a.executar();
  assert.equal(r.completo, false);
  assert.equal(r.avisos[0].codigo, 'CICLO_DE_ATALHOS');
});

test('listagem incompleta e paginação repetida abortam', async () => {
  for (const dados of [{ files: [], incompleteSearch: true }, { files: [], nextPageToken: 'repetida' }]) {
    const a = ambiente({ respostas: { [`lista:${ROOT}`]: { dados } } });
    await assert.rejects(a.executar(), /incompleta|repetiu/);
  }
});

for (const status of [401, 429, 500]) {
  test(`erro HTTP ${status} aborta em vez de apresentar sucesso parcial`, async () => {
    const a = ambiente({ respostas: { [`lista:${ROOT}`]: { status } } });
    await assert.rejects(a.executar(), new RegExp(`HTTP ${status}`));
  });
}

test('timeout não é interpretado como pasta vazia', async () => {
  const a = ambiente({ respostas: { [`lista:${ROOT}`]: new Error('Timeout de teste') } });
  await assert.rejects(a.executar(), /Timeout/);
});

test('interrompe limites de itens, pastas e profundidade', async () => {
  const a = ambiente({ conteudo: { [ROOT]: [[pasta(SUB), foto]], [SUB]: [[pdf]] } });
  await assert.rejects(a.executar({ limites: { itens: 1 } }), /Limite de itens/);
  await assert.rejects(a.executar({ limites: { pastas: 1 } }), /Limite de pastas/);
  await assert.rejects(a.executar({ limites: { profundidade: 1 } }), /profundidade/);
});

test('arquivo mensal novo permanece sem vínculo ou fase presumidos', async () => {
  const novo = { ...pdf, id: 'ARQUIVO_TABELA_NOVEMBRO_001', name: 'Tabela Brisa novembro fase 2.pdf' };
  const a = ambiente({ conteudo: { [ROOT]: [[novo, foto]] } });
  const r = await a.executar();
  exigirVarreduraCompleta(r);
  const p = prepararPendencias({ arquivos: r.arquivos }).pendencias;
  assert.equal(p.length, 1);
  assert.equal(p[0].motivo, 'PDF_NOVO_SEM_VINCULO');
  assert.equal(p[0].empreendimento_id, null);
  assert.equal(p[0].fase, null);
});

test('rejeita IDs/configurações inválidos antes de qualquer chamada', async () => {
  const a = ambiente();
  await assert.rejects(a.executar({ pastas: ["id' OR true"] }), /IDs válidos/);
  await assert.rejects(a.executar({ limites: { itens: -1 } }), /limites/);
  await assert.rejects(a.executar({ token: '' }), /Token/);
  assert.equal(a.chamadas.length, 0);
});


test('metadados válidos do original corrigem uma entrada sem data na listagem', async () => {
  const a = ambiente({ conteudo: { [ROOT]: [[{ ...pdf, modifiedTime: undefined }, atalho('ATALHO_TABELA_001', PDF)]] } });
  const r = await a.executar();
  assert.equal(r.arquivos[0].modifiedTime, pdf.modifiedTime);
});

test('informa o progresso antes da consulta e durante pastas/atalhos, sem expor credenciais', async () => {
  const eventos = [];
  const a = ambiente({ conteudo: { [ROOT]: [[atalho('ATALHO_CHAVE_001', DESTINO, { targetResourceKey: 'chave-privada' })]], [DESTINO]: [[pdf]] } });
  const r = await a.executar({ onProgresso: (info) => {
    if (info.evento === 'origem') assert.equal(a.chamadas.length, 0);
    eventos.push(info);
  } });
  assert.equal(r.completo, true);
  assert.equal(eventos[0].evento, 'origem');
  assert.equal(eventos.at(-1).evento, 'concluido');
  assert.ok(eventos.some((v) => v.evento === 'atalho'));
  assert.ok(eventos.some((v) => v.evento === 'pagina' && v.itensLidos === 2));
  assert.doesNotMatch(JSON.stringify(eventos), /token-de-teste|chave-privada/);
});

test('aborta consulta que não responde dentro do prazo total, sem marcar leitura concluída', async () => {
  const eventos = [];
  const fetchImpl = async (_url, opcoes) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ ok: true, json: async () => ({}) }), 500);
    opcoes.signal.addEventListener('abort', () => { clearTimeout(timer); reject(opcoes.signal.reason); }, { once: true });
  });
  await assert.rejects(listarArvoreDrive({ pastas: [ROOT], token: 'teste', fetchImpl, timeoutMs: 15,
    onProgresso: (info) => eventos.push(info) }), /Tempo de espera da consulta/);
  assert.equal(eventos.some((v) => v.evento === 'concluido'), false);
});

test('recusa prazo inválido sem consultar o Drive', async () => {
  const a = ambiente();
  for (const timeoutMs of [NaN, 0, -1, 1800001]) {
    await assert.rejects(a.executar({ timeoutMs }), /tempo máximo/);
  }
  assert.equal(a.chamadas.length, 0);
});

test('formata a etapa e neutraliza quebras de linha em nomes de pastas', () => {
  const { formatarProgressoDrive } = require('./drive-arvore.cjs');
  const texto = formatarProgressoDrive({ evento: 'pasta', caminho: ['Place', 'Construtora\nTeste'], segundos: 3, pastas: 2, itensLidos: 10 });
  assert.match(texto, /Drive 3s.*2 pastas.*10 itens.*Consultando pasta.*Place > Construtora Teste/);
  assert.doesNotMatch(texto, /\n/);
});

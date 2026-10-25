'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { exigirVarreduraCompleta, formatarProgressoDrive } = require('./drive-arvore.cjs');

async function executar({ completo, aplicar, supabaseErro = null, relatorio = false, falhaArquivo = false, quantidade = 1 }) {
  const gravacoes = [];
  const exportacoes = [];
  const mensagens = [];
  const banco = {
    from(tabela) {
      let escrevendo = false;
      const consulta = {
        select() { return consulta; },
        limit() { return consulta; },
        upsert(itens, opcoes) { escrevendo = true; gravacoes.push({ tabela, itens, opcoes }); return consulta; },
        then(resolve, reject) { return Promise.resolve({ data: escrevendo ? [{ id: 'pendencia-1' }] : [], error: tabela === 'empreendimentos' ? supabaseErro : null }).then(resolve, reject); },
      };
      return consulta;
    },
  };
  const processFake = {
    argv: ['node', 'script', ...(aplicar ? ['--apply'] : relatorio ? ['--relatorio', '/tmp/place-acervo.json'] : [])],
    env: {
      GOOGLE_APPLICATION_CREDENTIALS: '/credencial-de-teste.json',
      GOOGLE_DRIVE_DOCUMENTOS_FOLDER_IDS: 'PASTA_PLACE_001',
      SUPABASE_URL: 'https://projeto-de-teste.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'valor-falso-para-teste',
    },
    exitCode: undefined,
  };
  const sandbox = {
    process: processFake, Buffer, URLSearchParams, AbortSignal,
    console: Object.fromEntries(['log', 'error', 'warn', 'table'].map((metodo) => [metodo, (...args) => mensagens.push(args)])),
    fetch: async () => ({ ok: true, json: async () => ({ access_token: 'token-de-teste' }) }),
    require(nome) {
      if (nome === 'node:fs') return {
        readFileSync: () => JSON.stringify({ type: 'service_account', client_email: 'teste@example.test', private_key: 'valor-falso-para-teste' }),
        writeFileSync(destino, conteudo, opcoes) {
          if (falhaArquivo) throw new Error('EEXIST: relatório já existe');
          exportacoes.push({ destino, conteudo, opcoes });
        },
      };
      if (nome === 'node:path') return path;
      if (nome === 'node:crypto') return { sign: () => Buffer.from('assinatura-de-teste') };
      if (nome === 'dotenv') return { config() {} };
      if (nome === '@supabase/supabase-js') return { createClient: () => banco };
      if (nome === './drive-pendencias.cjs') return require(nome);
      if (nome === './drive-arvore.cjs') return {
        exigirVarreduraCompleta, formatarProgressoDrive,
        listarArvoreDrive: async (opcoes) => {
          opcoes.onProgresso?.({ evento: 'origem', caminho: ['Place'], segundos: 0, pastas: 0, itensLidos: 0 });
          return ({
          completo, avisos: completo ? [] : [{ codigo: 'DESTINO_INACESSIVEL', caminho: ['Place', 'Construtora'], mensagem: 'Acesso negado' }], resumo: { arquivos: 1 },
          arquivos: Array.from({ length: quantidade }, (_, i) => ({
            id: `PDF_TABELA_NOVA_${String(i + 1).padStart(3, '0')}`, name: 'Tabela nova.pdf',
            mimeType: 'application/pdf', modifiedTime: '2026-10-25T10:00:00Z',
            pastaId: 'PASTA_CONSTRUTORA_001', caminho: ['Place', 'Construtora', 'Imóvel', 'Tabela nova.pdf'],
            resourceKey: 'chave-que-nao-deve-sair', token: 'segredo-extra',
          })),
        }); },
      };
      throw new Error(`Dependência inesperada no teste: ${nome}`);
    },
  };
  const codigo = fs.readFileSync(path.join(__dirname, 'registrar-pendencias-drive.cjs'), 'utf8')
    .replace('executar().catch(', 'globalThis.execucao = executar().catch(');
  vm.runInNewContext(codigo, sandbox, { filename: 'registrar-pendencias-drive.cjs' });
  await sandbox.execucao;
  return { gravacoes, exportacoes, mensagens: JSON.stringify(mensagens), exitCode: processFake.exitCode };
}

test('modo padrão não grava nem quando a leitura está completa', async () => {
  const r = await executar({ completo: true, aplicar: false });
  assert.equal(r.gravacoes.length, 0);
  assert.equal(r.exitCode, undefined);
});

test('leitura parcial em simulação termina com código 2 sem gravar', async () => {
  const r = await executar({ completo: false, aplicar: false });
  assert.equal(r.gravacoes.length, 0);
  assert.equal(r.exitCode, 2);
  assert.match(r.mensagens, /LEITURA INCOMPLETA/);
});

test('--apply com leitura parcial bloqueia todas as gravações', async () => {
  const r = await executar({ completo: false, aplicar: true });
  assert.equal(r.gravacoes.length, 0);
  assert.equal(r.exitCode, 1);
  assert.match(r.mensagens, /Nenhuma pendência foi gravada/);
});

test('--apply com leitura completa grava somente pendências, sem aprovar documentos', async () => {
  const r = await executar({ completo: true, aplicar: true });
  assert.equal(r.exitCode, undefined);
  assert.equal(r.gravacoes.length, 1);
  assert.equal(r.gravacoes[0].tabela, 'empreendimento_documentos_pendencias');
  assert.equal(r.gravacoes[0].itens[0].drive_file_id, 'PDF_TABELA_NOVA_001');
  assert.equal(r.gravacoes[0].itens[0].empreendimento_id, null);
  assert.equal(r.gravacoes[0].itens[0].motivo, 'PDF_NOVO_SEM_VINCULO');
  assert.equal(r.gravacoes[0].opcoes.ignoreDuplicates, true);
  assert.doesNotMatch(r.mensagens, /valor-falso-para-teste|token-de-teste/);
});


test('registra as três etapas e o progresso no modo simulação', async () => {
  const r = await executar({ completo: true, aplicar: false });
  assert.match(r.mensagens, /\[1\/3\].*Supabase/);
  assert.match(r.mensagens, /\[2\/3\].*Google/);
  assert.match(r.mensagens, /\[3\/3\].*Drive/);
  assert.match(r.mensagens, /Conferindo origem: Place/);
  assert.equal(r.gravacoes.length, 0);
});

test('erro de JWT no Supabase aparece na primeira etapa e não chega ao Drive', async () => {
  const r = await executar({ completo: true, aplicar: false, supabaseErro: { message: 'JWT issued at future' } });
  assert.match(r.mensagens, /\[1\/3\]/);
  assert.match(r.mensagens, /Supabase\/empreendimentos: JWT issued at future/);
  assert.doesNotMatch(r.mensagens, /\[2\/3\]|\[3\/3\]/);
  assert.equal(r.exitCode, 1);
  assert.equal(r.gravacoes.length, 0);
});

test('relatório preserva ID, caminho e data, sem segredos nem gravação no banco', async () => {
  const r = await executar({ completo: true, relatorio: true });
  assert.equal(r.exitCode, undefined);
  assert.equal(r.gravacoes.length, 0);
  assert.equal(r.exportacoes.length, 1);
  const salvo = r.exportacoes[0];
  assert.equal(salvo.opcoes.flag, 'wx');
  assert.equal(salvo.opcoes.encoding, 'utf8');
  const dados = JSON.parse(salvo.conteudo);
  assert.equal(dados.modo, 'simulacao');
  assert.equal(dados.completo, true);
  assert.equal(dados.motivos_pendencias.PDF_NOVO_SEM_VINCULO, 1);
  assert.equal(dados.arquivos[0].id, 'PDF_TABELA_NOVA_001');
  assert.deepEqual(dados.arquivos[0].caminho, ['Place', 'Construtora', 'Imóvel', 'Tabela nova.pdf']);
  assert.equal(dados.arquivos[0].modificado_em, '2026-10-25T10:00:00Z');
  assert.equal(dados.pendencias[0].empreendimento_id, null);
  assert.doesNotMatch(salvo.conteudo, /valor-falso|token-de-teste|segredo-extra|chave-que-nao|resourceKey|private_key|SUPABASE/);
});

test('relatório parcial permanece identificado como incompleto e sai com código 2', async () => {
  const r = await executar({ completo: false, relatorio: true });
  assert.equal(r.gravacoes.length, 0);
  assert.equal(r.exitCode, 2);
  assert.equal(JSON.parse(r.exportacoes[0].conteudo).completo, false);
});

test('falha ao salvar relatório não grava nada no banco', async () => {
  const r = await executar({ completo: true, relatorio: true, falhaArquivo: true });
  assert.equal(r.exitCode, 1);
  assert.equal(r.gravacoes.length, 0);
  assert.match(r.mensagens, /EEXIST/);
});

test('mais de 100 candidatos não recomenda apply e bloqueia gravação', async () => {
  const simulacao = await executar({ completo: true, quantidade: 101 });
  assert.match(simulacao.mensagens, /--apply está bloqueado/);
  assert.equal(simulacao.gravacoes.length, 0);
  const aplicacao = await executar({ completo: true, aplicar: true, quantidade: 101 });
  assert.equal(aplicacao.exitCode, 1);
  assert.equal(aplicacao.gravacoes.length, 0);
});

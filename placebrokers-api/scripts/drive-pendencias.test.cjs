'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepararPendencias, idDeLinkLegado } = require('./drive-pendencias.cjs');

const pessoa = {
  id: 'em1', nome: 'Brisa do Mar',
  book_url: 'https://drive.google.com/file/d/BOOK123456789/view',
  tabela_url: null,
};
const doc = {
  id: 'doc1', empreendimento_id: 'em1',
  drive_file_id: 'TAB123456789', tipo: 'tabela', fase: 'Fase 1',
  status: 'aprovado', fonte_atualizada_em: '2026-10-20T13:45:57Z',
};
const arquivo = (id, modifiedTime, name = 'Tabela de preços.pdf') => ({
  id, name, mimeType: 'application/pdf', modifiedTime, pastaId: 'FOLDER123456789',
});
const verificar = (arquivos, documentos = [doc], empreendimentos = [pessoa]) =>
  prepararPendencias({ arquivos, documentos, empreendimentos });

test('PDFs atuais e livros legados não geram pendência', () => {
  const r = verificar([
    arquivo('TAB123456789', '2026-10-20T13:45:57.988Z'),
    arquivo('BOOK123456789', '2026-07-21T14:48:48Z', 'Book.pdf'),
  ]);
  assert.equal(r.pendencias.length, 0);
});

test('arquivo mais recente gera sugestão vinculada à mesma fase, sem alterar documento', () => {
  const antes = JSON.stringify(doc);
  const r = verificar([arquivo('TAB123456789', '2026-10-21T12:00:00Z')]);
  assert.equal(r.pendencias.length, 1);
  assert.equal(r.pendencias[0].motivo, 'ARQUIVO_MODIFICADO');
  assert.equal(r.pendencias[0].documento_id, 'doc1');
  assert.equal(r.pendencias[0].fase, 'Fase 1');
  assert.equal(JSON.stringify(doc), antes);
});

test('cinco segundos de tolerância evitam alerta inútil', () => {
  assert.equal(verificar([arquivo('TAB123456789', '2026-10-20T13:46:02Z')]).pendencias.length, 0);
});

test('arquivo novo não ganha empreendimento, tipo ou fase por palpite', () => {
  const r = verificar([arquivo('NEW123456789', '2026-10-23T10:00:00Z', 'Tabela Brisa Fase 2.pdf')]);
  assert.equal(r.pendencias.length, 1);
  assert.equal(r.pendencias[0].motivo, 'PDF_NOVO_SEM_VINCULO');
  assert.equal(r.pendencias[0].empreendimento_id, null);
  assert.equal(r.pendencias[0].tipo, null);
  assert.equal(r.pendencias[0].fase, null);
});

test('documento aprovado sem data-base exige revisão, sem aprovação automática', () => {
  const r = verificar([arquivo('TAB123456789', '2026-10-20T13:45:57Z')], [
    { ...doc, fonte_atualizada_em: null },
  ]);
  assert.equal(r.pendencias[0].motivo, 'SEM_DATA_REFERENCIA');
});

test('documentos pendentes ou arquivados não geram candidatos novos', () => {
  for (const status of ['pendente', 'arquivado']) {
    const r = verificar([arquivo('TAB123456789', '2026-10-23T10:00:00Z')], [{ ...doc, status }]);
    assert.equal(r.pendencias.length, 0);
  }
});

test('IDs repetidos de documento existente são sinalizados, não associados por adivinhação', () => {
  const r = verificar([arquivo('TAB123456789', '2026-10-23T10:00:00Z')], [doc, { ...doc, id: 'doc2' }]);
  assert.equal(r.pendencias[0].motivo, 'VINCULOS_REPETIDOS');
  assert.equal(r.pendencias[0].documento_id, null);
});

test('PDF com data inválida não é enviado ao banco', () => {
  const r = verificar([arquivo('NEW123456789', 'invalida')]);
  assert.equal(r.pendencias.length, 0);
  assert.equal(r.avisos.length, 1);
});

test('mesmo ID listado duas vezes é deduplicado', () => {
  const a = arquivo('NEW123456789', '2026-10-23T10:00:00Z');
  const r = verificar([a, { ...a }]);
  assert.equal(r.pendencias.length, 1);
});

test('não interpreta URL de site suspeito como documento legado', () => {
  assert.equal(idDeLinkLegado('https://example.com/file/d/BOOK123456789/view'), null);
  assert.equal(idDeLinkLegado('https://drive.google.com.evil.com/file/d/BOOK123456789/view'), null);
});

test('arquivos que não são PDF são ignorados', () => {
  const r = verificar([{ ...arquivo('NEW123456789', '2026-10-23T10:00:00Z'), mimeType: 'image/png' }]);
  assert.equal(r.pendencias.length, 0);
});

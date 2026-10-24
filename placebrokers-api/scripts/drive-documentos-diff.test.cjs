'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compararDocumentosDrive, idDriveDaUrl } = require('./drive-documentos-diff.cjs');

const emp = [{
  id: 'emp1', nome: 'Brisa do Mar',
  book_url: 'https://drive.google.com/file/d/ABCDEFGHIJKLMNO/view',
  tabela_url: null,
}];
const docs = [{
  id: 'doc1', empreendimento_id: 'emp1',
  drive_file_id: 'ZYXWVUTSRQPONML', tipo: 'tabela', fase: 'Fase 1',
  fonte_atualizada_em: '2026-10-20T13:45:57Z',
}];
const arquivo = (id, name, modifiedTime) =>
  ({ id, name, mimeType: 'application/pdf', modifiedTime });
const comparar = (arquivos, documentos=docs, empreendimentos=emp) =>
  compararDocumentosDrive({ arquivos, documentos, empreendimentos });

test('extrai apenas ID de URL do Drive reconhecida', () => {
  assert.equal(idDriveDaUrl(emp[0].book_url), 'ABCDEFGHIJKLMNO');
  assert.equal(idDriveDaUrl('https://evil.com/file/d/ABCDEFGHIJKLMNO/view'), null);
  assert.equal(idDriveDaUrl('https://drive.google.com/open?id=ABCDEFGHIJKLMNO'), null);
});

test('não trata documento vigente como novo', () => {
  const [r] = comparar([arquivo('ZYXWVUTSRQPONML', 'Tabela fase 1.pdf', '2026-10-20T13:45:57.999Z')]);
  assert.equal(r.situacao, 'CADASTRADO');
  assert.equal(r.fase, 'Fase 1');
});

test('detecta possível atualização posterior sem alterar registro', () => {
  const [r] = comparar([arquivo('ZYXWVUTSRQPONML', 'Tabela fase 1.pdf', '2026-10-21T13:45:57Z')]);
  assert.equal(r.situacao, 'REVISAR_MODIFICACAO');
});

test('datas separadas por poucos milissegundos não geram falso positivo', () => {
  const [r] = comparar([arquivo('ZYXWVUTSRQPONML', 'Tabela fase 1.pdf', '2026-10-20T13:45:59Z')]);
  assert.equal(r.situacao, 'CADASTRADO');
});

test('marca arquivo sem data de referência para revisão', () => {
  const [r] = comparar([arquivo('ZYXWVUTSRQPONML', 'Tabela.pdf', '2026-10-21T13:45:57Z')],
    [{ ...docs[0], fonte_atualizada_em: null }]);
  assert.equal(r.situacao, 'SEM_DATA_REFERENCIA');
});

test('reconhece book legado, sem classificar como novo', () => {
  const [r] = comparar([arquivo('ABCDEFGHIJKLMNO', 'book.pdf', '2026-10-21T13:45:57Z')]);
  assert.equal(r.situacao, 'VINCULO_LEGADO');
});

test('PDF desconhecido é candidato sem inferir imóvel', () => {
  const [r] = comparar([arquivo('UNLINKED0000000', 'nova tabela.pdf', '2026-10-21T13:45:57Z')]);
  assert.equal(r.situacao, 'CANDIDATO_SEM_VINCULO');
  assert.equal(r.empreendimento, '');
});

test('ignora imagens e arquivos não PDF', () => {
  assert.deepEqual(comparar([{ ...arquivo('PNG00000000000', 'capa.png', ''), mimeType: 'image/png' }]), []);
});

test('detecta vínculo duplicado ao mesmo arquivo', () => {
  const [r] = comparar([arquivo('ZYXWVUTSRQPONML', 'Tabela.pdf', '2026-10-21T13:45:57Z')], [docs[0], { ...docs[0], id:'doc2' }]);
  assert.equal(r.situacao, 'REVISAR_ID_REPETIDO');
});

test('não altera arrays de entrada', () => {
  const arr = [arquivo('UNLINKED0000000', 'nova.pdf', '2026-10-21T13:45:57Z')];
  const antes = JSON.stringify(arr);
  comparar(arr);
  assert.equal(JSON.stringify(arr), antes);
});

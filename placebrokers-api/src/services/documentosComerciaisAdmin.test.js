const { extrairIdDrive, normalizarDocumento, dataValida, conflitoDeFase } = require('./documentosComerciaisAdmin');

const id = '1AbCdEfGhIjKlMnOp';
const base = { tipo: 'tabela', titulo: 'Tabela Fase 1', fase: 'Fase 1', driveUrl: `https://drive.google.com/file/d/${id}/view`, validadeAte: '' };

test('aceita URL de arquivo Drive válida', () => {
  expect(extrairIdDrive(base.driveUrl)).toBe(id);
  expect(extrairIdDrive(`https://drive.google.com/open?id=${id}`)).toBe(id);
});
test('rejeita domínios falsos e links externos', () => {
  expect(extrairIdDrive(`https://drive.google.com.evil.test/file/d/${id}/view`)).toBe(null);
  expect(extrairIdDrive(`javascript:alert(1)`)).toBe(null);
  expect(extrairIdDrive(`https://evil.test/file/d/${id}/view`)).toBe(null);
});
test('não aceita id curto', () => {
  expect(extrairIdDrive('https://drive.google.com/file/d/short/view')).toBe(null);
});
test('normaliza documento e validade vazia', () => {
  const { dados, erros } = normalizarDocumento(base);
  expect(erros).toEqual({});
  expect(dados).toEqual({ tipo: 'tabela', titulo: 'Tabela Fase 1', fase: 'Fase 1', drive_file_id: id, validade_ate: null });
});
test('valida título, tipo e URL', () => {
  const { erros } = normalizarDocumento({ ...base, tipo: 'admin', titulo: 'x', driveUrl: 'https://evil.test/' });
  expect(erros).toHaveProperty('tipo');
  expect(erros).toHaveProperty('titulo');
  expect(erros).toHaveProperty('driveUrl');
});
test('rejeita datas inexistentes', () => {
  expect(dataValida('2026-02-30')).toBe(false);
  expect(dataValida('2026-10-31')).toBe(true);
});
test('impede mesma fase aprovada vigente sem interferir em outras fases', () => {
  const lista = [{ id: 'a', tipo: 'tabela', fase: 'Fase 1', status: 'aprovado', validade_ate: null }];
  expect(conflitoDeFase(lista, { tipo: 'tabela', fase: 'fase 1' }, undefined, '2026-10-24')).toBe(true);
  expect(conflitoDeFase(lista, { tipo: 'tabela', fase: 'Fase 2' }, undefined, '2026-10-24')).toBe(false);
  expect(conflitoDeFase(lista, { tipo: 'book', fase: 'Fase 1' }, undefined, '2026-10-24')).toBe(false);
  expect(conflitoDeFase(lista, { tipo: 'tabela', fase: 'Fase 1' }, 'a', '2026-10-24')).toBe(false);
});
test('não bloqueia documento vencido', () => {
  expect(conflitoDeFase([{ id: 'b', tipo: 'tabela', fase: 'Fase 1', status: 'aprovado', validade_ate: '2026-10-01' }],
    { tipo: 'tabela', fase: 'Fase 1' }, null, '2026-10-24')).toBe(false);
});

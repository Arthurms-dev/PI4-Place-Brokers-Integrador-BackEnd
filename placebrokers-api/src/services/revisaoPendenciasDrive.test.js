'use strict';
const { validarRevisao } = require('./revisaoPendenciasDrive');
const entrada = { acao: 'vincular', revisao: 0, empreendimentoId: '10000000-0000-0000-0000-000000000001',
  tipo: 'tabela', titulo: ' Outubro ', fase: ' Fase 1 ', validadeAte: '2026-10-31' };

test('normaliza vínculo sem permitir que o cliente altere origem, status ou revisor', () => {
  const r = validarRevisao({ ...entrada, drive_file_id: 'OUTRO_ARQUIVO', status: 'aprovado', revisor: 'terceiro' });
  expect(r.erros).toEqual({});
  expect(r.dados).toEqual({ empreendimentoId: entrada.empreendimentoId, documentoId: null,
    tipo: 'tabela', titulo: 'Outubro', fase: 'Fase 1', validadeAte: '2026-10-31' });
});
test.each([null, [], {}, { acao: 'excluir', revisao: 0 }, { ...entrada, revisao: -1 },
  { ...entrada, revisao: '0' }, { ...entrada, empreendimentoId: 'errado' },
  { ...entrada, documentoId: 'errado' }, { ...entrada, validadeAte: '2026-02-30' }])(
  'rejeita entrada inválida: %p', (e) => expect(Object.keys(validarRevisao(e).erros).length).toBeGreaterThan(0));
test('conclusão exige confirmação booleana e motivo, ignorar exige motivo', () => {
  expect(validarRevisao({ acao: 'concluir', revisao: 1, motivo: 'Conferido o documento.', confirmarAprovacao: 'true' }).erros)
    .toHaveProperty('confirmarAprovacao');
  expect(validarRevisao({ acao: 'ignorar', revisao: 0, motivo: 'curto' }).erros).toHaveProperty('motivo');
  expect(validarRevisao({ acao: 'ignorar', revisao: 0, motivo: 'Documento institucional.' }).erros).toEqual({});
});

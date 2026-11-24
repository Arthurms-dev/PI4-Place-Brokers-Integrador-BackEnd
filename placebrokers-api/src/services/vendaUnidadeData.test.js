'use strict';
const { VendaService, validarDataVenda } = require('./vendaservice');

const corretor = { id: 'c1', cargo: 'corretor' };
function setup() {
  const vendaRepository = { criar: jest.fn(async (v) => v) };
  const clienteRepository = { buscarPorId: jest.fn().mockResolvedValue({ id: 'cli', corretor: { id: 'c1' } }) };
  return { vendaRepository, service: new VendaService({ vendaRepository, clienteRepository, equipeRepository: {} }) };
}
const HOJE = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
const base = { valor: 300000, clienteId: 'cli', unidade: 'Torre A, 1203', dataVenda: HOJE };

describe('venda com unidade e data', () => {
  test('unidade é obrigatória', async () => {
    const { service, vendaRepository } = setup();
    await expect(service.criar({ ...base, unidade: '  ' }, corretor)).rejects.toMatchObject({ fieldErrors: { unidade: expect.any(String) } });
    expect(vendaRepository.criar).not.toHaveBeenCalled();
  });

  test('unidade tem no máximo 40 caracteres', async () => {
    const { service } = setup();
    await expect(service.criar({ ...base, unidade: 'x'.repeat(41) }, corretor)).rejects.toMatchObject({ fieldErrors: { unidade: expect.any(String) } });
  });

  test('data é obrigatória', async () => {
    const { service } = setup();
    await expect(service.criar({ ...base, dataVenda: '' }, corretor)).rejects.toMatchObject({ fieldErrors: { dataVenda: expect.any(String) } });
  });

  test('grava unidade e data', async () => {
    const { service, vendaRepository } = setup();
    await service.criar(base, corretor);
    expect(vendaRepository.criar).toHaveBeenCalledWith(expect.objectContaining({ unidade: 'Torre A, 1203', data_venda: HOJE }));
  });
});

describe('validarDataVenda', () => {
  const agora = new Date('2026-11-24T15:00:00Z'); // 12h em Recife
  test.each([
    ['2026-11-24', null],
    ['2026-11-25', 'A data da venda não pode ser futura.'],
    ['2025-11-24', null],
    ['2025-11-23', 'A data da venda tem mais de 1 ano.'],
    ['24/11/2026', 'Data inválida.'],
    ['2026-13-40', 'Data inválida.'],
  ])('%s', (data, esperado) => {
    expect(validarDataVenda(data, agora)).toBe(esperado);
  });

  test('perto da meia-noite usa o dia de Recife', () => {
    // 01h UTC do dia 25 = 22h do dia 24 em Recife: dia 25 ainda é futuro.
    expect(validarDataVenda('2026-11-25', new Date('2026-11-25T01:00:00Z'))).toBe('A data da venda não pode ser futura.');
  });
});

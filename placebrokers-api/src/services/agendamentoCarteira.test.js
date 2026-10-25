'use strict';
const { AgendamentoService } = require('./agendamentoService');

test('listagem do corretor usa consulta limitada no repositório', async () => {
  const repo = {
    listar: jest.fn(),
    listarPorCorretor: jest.fn().mockResolvedValue([{
      id: 'ag-1', tipo: 'visita_imovel', data_hora: '2026-10-25T15:00:00.000Z',
      cliente: { id: 'cli-1', nome: 'Cliente da carteira' }, corretor: { id: 'cor-1', nome: 'Corretor' },
    }]),
  };
  const service = new AgendamentoService({ agendamentoRepository: repo });
  const rows = await service.listarPorCorretor('cor-1');
  expect(repo.listarPorCorretor).toHaveBeenCalledWith('cor-1');
  expect(repo.listar).not.toHaveBeenCalled();
  expect(rows).toMatchObject([{ id: 'ag-1', cliente: { nome: 'Cliente da carteira' } }]);
});


'use strict';

const { AgendamentoController } = require('./agendamentoController');
const { AppError } = require('../errors/AppError');

function criarRespostaMock() {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
    end: jest.fn(),
  };

  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.end.mockReturnValue(res);

  return res;
}

describe('AgendamentoController', () => {
  let agendamentoService;
  let controller;
  let res;

  beforeEach(() => {
    agendamentoService = {
      listar: jest.fn(),
      criar: jest.fn(),
      remarcar: jest.fn(),
      atualizarStatus: jest.fn(),
      buscarPorId: jest.fn(),
      atualizar: jest.fn(),
      excluir: jest.fn(),
    };

    controller = new AgendamentoController({ agendamentoService });
    res = criarRespostaMock();
  });

  test('lista agendamentos e retorna HTTP 200', async () => {
    const agendamentos = [{ id: 'ag-1', status: 'agendado' }];
    agendamentoService.listar.mockResolvedValue(agendamentos);

    await controller.listar({}, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ agendamentos });
  });

  test('cria agendamento e retorna HTTP 201', async () => {
    const dados = {
      tipo: 'visita_imovel',
      dataHora: '2026-12-10T14:00:00.000Z',
      clienteId: 'cliente-1',
      corretorId: 'corretor-1',
    };

    const agendamento = { id: 'ag-1', ...dados };
    agendamentoService.criar.mockResolvedValue(agendamento);

    await controller.criar({ body: dados }, res);

    expect(agendamentoService.criar).toHaveBeenCalledWith(dados);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ agendamento });
  });

  test('remarca agendamento e retorna HTTP 200', async () => {
    const agendamento = { id: 'ag-1', dataHora: '2026-12-11T14:00:00.000Z' };
    agendamentoService.remarcar.mockResolvedValue(agendamento);

    await controller.remarcar({
      params: { id: 'ag-1' },
      body: { dataHora: agendamento.dataHora },
    }, res);

    expect(agendamentoService.remarcar).toHaveBeenCalledWith(
      'ag-1',
      agendamento.dataHora
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ agendamento });
  });

  test('retorna erro de validação com status e detalhes', async () => {
    const erro = new AppError(
      'VALIDATION_ERROR',
      'Verifique os campos.',
      400,
      { dataHora: 'Data inválida.' }
    );

    agendamentoService.criar.mockRejectedValue(erro);

    await controller.criar({ body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Verifique os campos.',
        fieldErrors: { dataHora: 'Data inválida.' },
      },
    });
  });

  test('retorna HTTP 500 para erros inesperados', async () => {
    const erro = new Error('Falha inesperada');
    agendamentoService.listar.mockRejectedValue(erro);

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await controller.listar({}, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Erro interno no servidor.',
      },
    });

    consoleSpy.mockRestore();
  });
});

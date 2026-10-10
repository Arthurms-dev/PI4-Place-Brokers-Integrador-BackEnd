'use strict';

const { AgendamentoService } = require('./agendamentoService');

function createDeps(overrides = {}) {
  return {
    agendamentoRepository: {
      listar: jest.fn(),
      buscarPorId: jest.fn(),
      listarPorCorretorEData: jest.fn().mockResolvedValue([]),
      criar: jest.fn(),
      atualizarStatus: jest.fn(),
      remarcar: jest.fn(),
      ...overrides.agendamentoRepository,
    },
  };
}

const rowVisita = {
  id: 'ag-1',
  tipo: 'visita_imovel',
  data_hora: '2026-10-10T14:00:00.000Z',
  duracao_minutos: 60,
  status: 'agendado',
  local: null,
  observacoes: 'Cliente quer levar o cônjuge.',
  motivo_cancelamento: null,
  interesse_apos_visita: null,
  lead_origem_id: 'lead-1',
  criado_em: '2026-10-01T10:00:00.000Z',
  atualizado_em: '2026-10-01T10:00:00.000Z',
  cliente: { id: 'cliente-1', nome: 'Mariana Silva', telefone: '81999990001' },
  corretor: { id: 'corretor-1', nome: 'Rafael Santos' },
  empreendimento: { id: 'emp-1', nome: 'Residencial Mar Azul', bairro: 'Boa Viagem', cidade: 'Recife', uf: 'PE'},
};

const dadosVisitaValida = {
  tipo: 'visita_imovel',
  dataHora: '2026-10-10T14:00:00.000Z',
  clienteId: 'cliente-1',
  corretorId: 'corretor-1',
  empreendimentoId: 'emp-1',
};

describe('AgendamentoService', () => {
  describe('listar', () => {
    test('converte cada linha para o formato esperado pelo front-end', async () => {
      const deps = createDeps({ agendamentoRepository: { listar: jest.fn().mockResolvedValue([rowVisita]) } });
      const service = new AgendamentoService(deps);

      const [agendamento] = await service.listar();

      expect(agendamento).toMatchObject({
        id: 'ag-1',
        tipo: 'visita_imovel',
        dataHora: '2026-10-10T14:00:00.000Z',
        duracaoMinutos: 60,
        status: 'agendado',
        cliente: { id: 'cliente-1', nome: 'Mariana Silva', telefone: '81999990001' },
        corretor: { id: 'corretor-1', nome: 'Rafael Santos' },
        empreendimento: { id: 'emp-1', nome: 'Residencial Mar Azul', bairro: 'Boa Viagem', cidade: 'Recife', uf: 'PE'},
      });
    });
  });

  describe('criar', () => {
    test('visita a imóvel: cria quando não há conflito', async () => {
      const deps = createDeps({ agendamentoRepository: { criar: jest.fn().mockResolvedValue(rowVisita) } });
      const service = new AgendamentoService(deps);

      const agendamento = await service.criar(dadosVisitaValida);

      expect(agendamento.id).toBe('ag-1');
      expect(deps.agendamentoRepository.criar).toHaveBeenCalledWith({ ...dadosVisitaValida, duracaoMinutos: 60 });
    });

    test('reunião no escritório: não exige empreendimentoId', async () => {
      const deps = createDeps({
        agendamentoRepository: { criar: jest.fn().mockResolvedValue({ ...rowVisita, tipo: 'reuniao_escritorio', empreendimento: null }) },
      });
      const service = new AgendamentoService(deps);

      const agendamento = await service.criar({
        tipo: 'reuniao_escritorio',
        dataHora: '2026-10-10T14:00:00.000Z',
        clienteId: 'cliente-1',
        corretorId: 'corretor-1',
        local: 'Sala 2 - escritório',
      });

      expect(agendamento.tipo).toBe('reuniao_escritorio');
      expect(deps.agendamentoRepository.criar).toHaveBeenCalled();
    });

    test('visita a imóvel sem empreendimentoId: lança AppError de validação sem criar', async () => {
      const deps = createDeps();
      const service = new AgendamentoService(deps);
      const { empreendimentoId, ...semImovel } = dadosVisitaValida;

      await expect(service.criar(semImovel)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        fieldErrors: { empreendimentoId: expect.any(String) },
      });
      expect(deps.agendamentoRepository.criar).not.toHaveBeenCalled();
    });

    test('tipo inválido: lança AppError de validação', async () => {
      const deps = createDeps();
      const service = new AgendamentoService(deps);

      await expect(service.criar({ ...dadosVisitaValida, tipo: 'cafe' })).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        fieldErrors: { tipo: expect.any(String) },
      });
      expect(deps.agendamentoRepository.criar).not.toHaveBeenCalled();
    });

    test('corretor com outro agendamento no mesmo horário: lança AppError CONFLITO_HORARIO sem criar', async () => {
      const deps = createDeps({
        agendamentoRepository: { listarPorCorretorEData: jest.fn().mockResolvedValue([rowVisita]) },
      });
      const service = new AgendamentoService(deps);

      await expect(service.criar({ ...dadosVisitaValida, dataHora: '2026-10-10T14:30:00.000Z' })).rejects.toMatchObject({
        code: 'CONFLITO_HORARIO',
        statusCode: 409,
      });
      expect(deps.agendamentoRepository.criar).not.toHaveBeenCalled();
    });

    test('mesmo corretor, horário sem sobreposição: cria normalmente', async () => {
      const deps = createDeps({
        agendamentoRepository: {
          listarPorCorretorEData: jest.fn().mockResolvedValue([rowVisita]),
          criar: jest.fn().mockResolvedValue({ ...rowVisita, id: 'ag-2', data_hora: '2026-10-10T16:00:00.000Z' }),
        },
      });
      const service = new AgendamentoService(deps);

      const agendamento = await service.criar({ ...dadosVisitaValida, dataHora: '2026-10-10T16:00:00.000Z' });

      expect(agendamento.id).toBe('ag-2');
    });
  });

  describe('remarcar', () => {
    test('caso de sucesso: muda a data/hora sem conflito', async () => {
      const deps = createDeps({
        agendamentoRepository: {
          buscarPorId: jest.fn().mockResolvedValue(rowVisita),
          remarcar: jest.fn().mockResolvedValue({ ...rowVisita, data_hora: '2026-10-11T14:00:00.000Z' }),
        },
      });
      const service = new AgendamentoService(deps);

      const agendamento = await service.remarcar('ag-1', '2026-10-11T14:00:00.000Z');

      expect(agendamento.dataHora).toBe('2026-10-11T14:00:00.000Z');
      expect(deps.agendamentoRepository.remarcar).toHaveBeenCalledWith('ag-1', '2026-10-11T14:00:00.000Z');
    });

    test('novo horário em conflito com outro agendamento do mesmo corretor: lança CONFLITO_HORARIO', async () => {
      const outroAgendamento = { ...rowVisita, id: 'ag-2', data_hora: '2026-10-11T14:00:00.000Z' };
      const deps = createDeps({
        agendamentoRepository: {
          buscarPorId: jest.fn().mockResolvedValue(rowVisita),
          listarPorCorretorEData: jest.fn().mockResolvedValue([outroAgendamento]),
        },
      });
      const service = new AgendamentoService(deps);

      await expect(service.remarcar('ag-1', '2026-10-11T14:30:00.000Z')).rejects.toMatchObject({
        code: 'CONFLITO_HORARIO',
      });
      expect(deps.agendamentoRepository.remarcar).not.toHaveBeenCalled();
    });

    test('data/hora inválida: lança AppError de validação', async () => {
      const deps = createDeps({ agendamentoRepository: { buscarPorId: jest.fn().mockResolvedValue(rowVisita) } });
      const service = new AgendamentoService(deps);

      await expect(service.remarcar('ag-1', 'não-é-uma-data')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    test('agendamento inexistente: lança AppError NOT_FOUND', async () => {
      const deps = createDeps({ agendamentoRepository: { buscarPorId: jest.fn().mockResolvedValue(null) } });
      const service = new AgendamentoService(deps);

      await expect(service.remarcar('ag-x', '2026-10-11T14:00:00.000Z')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('atualizarStatus', () => {
    test('caso de sucesso: confirma o agendamento', async () => {
      const deps = createDeps({
        agendamentoRepository: {
          buscarPorId: jest.fn().mockResolvedValue(rowVisita),
          atualizarStatus: jest.fn().mockResolvedValue({ ...rowVisita, status: 'confirmado' }),
        },
      });
      const service = new AgendamentoService(deps);

      const agendamento = await service.atualizarStatus('ag-1', 'confirmado');

      expect(agendamento.status).toBe('confirmado');
    });

    test('status fora do enum: lança AppError de validação sem tocar no banco', async () => {
      const deps = createDeps();
      const service = new AgendamentoService(deps);

      await expect(service.atualizarStatus('ag-1', 'invalido')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(deps.agendamentoRepository.buscarPorId).not.toHaveBeenCalled();
    });

    test('cancelar sem motivo: lança AppError de validação', async () => {
      const deps = createDeps();
      const service = new AgendamentoService(deps);

      await expect(service.atualizarStatus('ag-1', 'cancelado')).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        fieldErrors: { motivoCancelamento: expect.any(String) },
      });
    });

    test('cancelar com motivo: funciona', async () => {
      const deps = createDeps({
        agendamentoRepository: {
          buscarPorId: jest.fn().mockResolvedValue(rowVisita),
          atualizarStatus: jest.fn().mockResolvedValue({ ...rowVisita, status: 'cancelado', motivo_cancelamento: 'Cliente desistiu' }),
        },
      });
      const service = new AgendamentoService(deps);

      const agendamento = await service.atualizarStatus('ag-1', 'cancelado', { motivoCancelamento: 'Cliente desistiu' });

      expect(agendamento.status).toBe('cancelado');
      expect(deps.agendamentoRepository.atualizarStatus).toHaveBeenCalledWith('ag-1', 'cancelado', {
        motivoCancelamento: 'Cliente desistiu',
      });
    });

    test('marcar como realizado antes da data/hora: lança AppError de validação', async () => {
      const futuro = { ...rowVisita, data_hora: new Date(Date.now() + 86400000).toISOString() };
      const deps = createDeps({ agendamentoRepository: { buscarPorId: jest.fn().mockResolvedValue(futuro) } });
      const service = new AgendamentoService(deps);

      await expect(service.atualizarStatus('ag-1', 'realizado')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    test('marcar como realizado depois da data/hora: funciona', async () => {
      const passado = { ...rowVisita, data_hora: new Date(Date.now() - 86400000).toISOString() };
      const deps = createDeps({
        agendamentoRepository: {
          buscarPorId: jest.fn().mockResolvedValue(passado),
          atualizarStatus: jest.fn().mockResolvedValue({ ...passado, status: 'realizado' }),
        },
      });
      const service = new AgendamentoService(deps);

      const agendamento = await service.atualizarStatus('ag-1', 'realizado');

      expect(agendamento.status).toBe('realizado');
    });

    test('agendamento inexistente: lança AppError NOT_FOUND', async () => {
      const deps = createDeps({ agendamentoRepository: { buscarPorId: jest.fn().mockResolvedValue(null) } });
      const service = new AgendamentoService(deps);

      await expect(service.atualizarStatus('ag-x', 'confirmado')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });
});
'use strict';

const { VendaService } = require('./vendaservice');

const admin = { id: 'admin-1', cargo: 'admin' };
const gerente = { id: 'ger-1', cargo: 'gerente' };
const corretor = { id: 'cor-1', cargo: 'corretor' };

function criarMocks() {
  return {
    vendaRepository: {
      criar: jest.fn(),
      listarTodas: jest.fn(),
      listarPorCorretores: jest.fn(),
      buscarPorId: jest.fn(),
      atualizar: jest.fn(),
      converterLeadDoCliente: jest.fn(),
    },
    equipeRepository: {
      listarTimesDoGerente: jest.fn(),
      listar: jest.fn(),
      listarTimesPorDiretoria: jest.fn(),
    },
    clienteRepository: {
      buscarPorId: jest.fn(),
    },
  };
}

const MEMBROS = [
  { id: 'cor-1', equipe_id: 'eq-1' },
  { id: 'cor-2', equipe_id: 'eq-1' },
  { id: 'cor-3', equipe_id: 'eq-2' },
  { id: 'cor-4', equipe_id: 'eq-9' },
];

let mocks;
let service;

beforeEach(() => {
  mocks = criarMocks();
  service = new VendaService(mocks);
});

describe('VendaService.corretoresVisiveis', () => {
  test('admin enxerga todos (null) e não consulta equipes', async () => {
    const ids = await service.corretoresVisiveis(admin);

    expect(ids).toBeNull();
    expect(mocks.equipeRepository.listarTimesDoGerente).not.toHaveBeenCalled();
  });

  test('gerente sem equipes não enxerga ninguém', async () => {
    mocks.equipeRepository.listarTimesDoGerente.mockResolvedValue([]);

    const ids = await service.corretoresVisiveis(gerente);

    expect(ids).toEqual([]);
    expect(mocks.equipeRepository.listar).not.toHaveBeenCalled();
  });

  test('gerente enxerga só os membros das equipes dele', async () => {
    mocks.equipeRepository.listarTimesDoGerente.mockResolvedValue([{ id: 'eq-1' }, { id: 'eq-2' }]);
    mocks.equipeRepository.listar.mockResolvedValue(MEMBROS);

    const ids = await service.corretoresVisiveis(gerente);

    expect(mocks.equipeRepository.listarTimesDoGerente).toHaveBeenCalledWith('ger-1');
    expect(ids).toEqual(['cor-1', 'cor-2', 'cor-3']);
  });

  test('corretor enxerga apenas a si mesmo', async () => {
    const ids = await service.corretoresVisiveis(corretor);

    expect(ids).toEqual(['cor-1']);
    expect(mocks.equipeRepository.listarTimesDoGerente).not.toHaveBeenCalled();
  });
});

describe('VendaService.criar', () => {
  const clienteDoCorretor = { id: 'cli-1', corretor: { id: 'cor-1' } };

  test.each([[undefined], [null], [''], [0], [-10], ['abc'], [Infinity]])(
    'rejeita valor inválido (%p) sem consultar o banco',
    async (valor) => {
      await expect(service.criar({ valor, clienteId: 'cli-1' }, corretor))
        .rejects.toHaveProperty('code', 'VALIDATION_ERROR');

      expect(mocks.clienteRepository.buscarPorId).not.toHaveBeenCalled();
      expect(mocks.vendaRepository.criar).not.toHaveBeenCalled();
    },
  );

  test('rejeita chamada sem dados (parâmetro omitido)', async () => {
    await expect(service.criar(undefined, corretor))
      .rejects.toHaveProperty('code', 'VALIDATION_ERROR');

    expect(mocks.vendaRepository.criar).not.toHaveBeenCalled();
  });

  test('rejeita venda sem cliente', async () => {
    await expect(service.criar({ valor: 1000 }, corretor))
      .rejects.toHaveProperty('code', 'VALIDATION_ERROR');

    expect(mocks.clienteRepository.buscarPorId).not.toHaveBeenCalled();
    expect(mocks.vendaRepository.criar).not.toHaveBeenCalled();
  });

  test('rejeita cliente inexistente', async () => {
    mocks.clienteRepository.buscarPorId.mockResolvedValue(null);

    await expect(service.criar({ valor: 1000, clienteId: 'cli-x' }, corretor))
      .rejects.toHaveProperty('code', 'NOT_FOUND');

    expect(mocks.vendaRepository.criar).not.toHaveBeenCalled();
  });

  test('rejeita cliente que pertence a outro corretor', async () => {
    mocks.clienteRepository.buscarPorId.mockResolvedValue({ id: 'cli-1', corretor: { id: 'cor-2' } });

    await expect(service.criar({ valor: 1000, clienteId: 'cli-1' }, corretor))
      .rejects.toHaveProperty('code', 'FORBIDDEN');

    expect(mocks.vendaRepository.criar).not.toHaveBeenCalled();
  });

  test('rejeita cliente sem corretor responsável', async () => {
    mocks.clienteRepository.buscarPorId.mockResolvedValue({ id: 'cli-1', corretor: null });

    await expect(service.criar({ valor: 1000, clienteId: 'cli-1' }, corretor))
      .rejects.toHaveProperty('code', 'FORBIDDEN');

    expect(mocks.vendaRepository.criar).not.toHaveBeenCalled();
  });

  test('cria venda pendente convertendo o valor para número', async () => {
    const vendaCriada = { id: 'v-1' };
    mocks.clienteRepository.buscarPorId.mockResolvedValue(clienteDoCorretor);
    mocks.vendaRepository.criar.mockResolvedValue(vendaCriada);

    const resultado = await service.criar(
      { valor: '350000.50', empreendimentoId: 'emp-1', clienteId: 'cli-1' },
      corretor,
    );

    expect(resultado).toBe(vendaCriada);
    expect(mocks.clienteRepository.buscarPorId).toHaveBeenCalledWith('cli-1');
    expect(mocks.vendaRepository.criar).toHaveBeenCalledWith({
      corretor_id: 'cor-1',
      cliente_id: 'cli-1',
      empreendimento_id: 'emp-1',
      valor: 350000.5,
      status: 'pendente',
    });
  });

  test('aceita venda sem empreendimento (grava null)', async () => {
    mocks.clienteRepository.buscarPorId.mockResolvedValue(clienteDoCorretor);
    mocks.vendaRepository.criar.mockResolvedValue({ id: 'v-2' });

    await service.criar({ valor: 100, clienteId: 'cli-1' }, corretor);

    expect(mocks.vendaRepository.criar).toHaveBeenCalledWith({
      corretor_id: 'cor-1',
      cliente_id: 'cli-1',
      empreendimento_id: null,
      valor: 100,
      status: 'pendente',
    });
  });
});

describe('VendaService.listar', () => {
  test('admin lista todas as vendas', async () => {
    const vendas = [{ id: 'v-1' }];
    mocks.vendaRepository.listarTodas.mockResolvedValue(vendas);

    const resultado = await service.listar(admin);

    expect(resultado).toBe(vendas);
    expect(mocks.vendaRepository.listarPorCorretores).not.toHaveBeenCalled();
  });

  test('corretor lista só as próprias vendas', async () => {
    mocks.vendaRepository.listarPorCorretores.mockResolvedValue([{ id: 'v-2' }]);

    const resultado = await service.listar(corretor);

    expect(resultado).toEqual([{ id: 'v-2' }]);
    expect(mocks.vendaRepository.listarPorCorretores).toHaveBeenCalledWith(['cor-1']);
    expect(mocks.vendaRepository.listarTodas).not.toHaveBeenCalled();
  });

  test('gerente lista as vendas dos corretores da equipe', async () => {
    mocks.equipeRepository.listarTimesDoGerente.mockResolvedValue([{ id: 'eq-1' }]);
    mocks.equipeRepository.listar.mockResolvedValue(MEMBROS);
    mocks.vendaRepository.listarPorCorretores.mockResolvedValue([]);

    await service.listar(gerente);

    expect(mocks.vendaRepository.listarPorCorretores).toHaveBeenCalledWith(['cor-1', 'cor-2']);
  });

  test('gerente sem equipe consulta com lista vazia', async () => {
    mocks.equipeRepository.listarTimesDoGerente.mockResolvedValue([]);
    mocks.vendaRepository.listarPorCorretores.mockResolvedValue([]);

    const resultado = await service.listar(gerente);

    expect(resultado).toEqual([]);
    expect(mocks.vendaRepository.listarPorCorretores).toHaveBeenCalledWith([]);
  });
});

describe('VendaService.decidir', () => {
  const vendaPendente = { id: 'v-1', status: 'pendente', corretor_id: 'cor-1', cliente_id: 'cli-1' };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-14T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('rejeita status inválido antes de consultar o banco', async () => {
    await expect(service.decidir('v-1', 'aprovada', admin))
      .rejects.toHaveProperty('code', 'VALIDATION_ERROR');

    expect(mocks.vendaRepository.buscarPorId).not.toHaveBeenCalled();
  });

  test('corretor não pode decidir venda', async () => {
    await expect(service.decidir('v-1', 'confirmada', corretor))
      .rejects.toHaveProperty('code', 'FORBIDDEN');

    expect(mocks.vendaRepository.buscarPorId).not.toHaveBeenCalled();
    expect(mocks.vendaRepository.atualizar).not.toHaveBeenCalled();
  });

  test('rejeita venda inexistente', async () => {
    mocks.vendaRepository.buscarPorId.mockResolvedValue(null);

    await expect(service.decidir('v-x', 'confirmada', admin))
      .rejects.toHaveProperty('code', 'NOT_FOUND');

    expect(mocks.vendaRepository.atualizar).not.toHaveBeenCalled();
  });

  test('rejeita venda que já foi decidida', async () => {
    mocks.vendaRepository.buscarPorId.mockResolvedValue({ ...vendaPendente, status: 'confirmada' });

    await expect(service.decidir('v-1', 'recusada', admin))
      .rejects.toHaveProperty('code', 'CONFLICT');

    expect(mocks.vendaRepository.atualizar).not.toHaveBeenCalled();
  });

  test('gerente não decide venda de corretor fora da equipe', async () => {
    mocks.vendaRepository.buscarPorId.mockResolvedValue({ ...vendaPendente, corretor_id: 'cor-4' });
    mocks.equipeRepository.listarTimesDoGerente.mockResolvedValue([{ id: 'eq-1' }]);
    mocks.equipeRepository.listar.mockResolvedValue(MEMBROS);

    await expect(service.decidir('v-1', 'confirmada', gerente))
      .rejects.toHaveProperty('code', 'FORBIDDEN');

    expect(mocks.vendaRepository.atualizar).not.toHaveBeenCalled();
  });

  test('gerente confirma venda da própria equipe e marca o lead como convertido', async () => {
    const atualizada = { id: 'v-1', status: 'confirmada' };
    mocks.vendaRepository.buscarPorId.mockResolvedValue(vendaPendente);
    mocks.equipeRepository.listarTimesDoGerente.mockResolvedValue([{ id: 'eq-1' }]);
    mocks.equipeRepository.listar.mockResolvedValue(MEMBROS);
    mocks.vendaRepository.atualizar.mockResolvedValue(atualizada);
    mocks.vendaRepository.converterLeadDoCliente.mockResolvedValue(undefined);

    const resultado = await service.decidir('v-1', 'confirmada', gerente);

    expect(resultado).toBe(atualizada);
    expect(mocks.vendaRepository.atualizar).toHaveBeenCalledWith('v-1', {
      status: 'confirmada',
      confirmado_por: 'ger-1',
      confirmado_em: '2026-11-14T12:00:00.000Z',
    });
    expect(mocks.vendaRepository.converterLeadDoCliente).toHaveBeenCalledWith('cli-1');
  });

  test('admin recusa venda sem consultar equipe nem converter lead', async () => {
    mocks.vendaRepository.buscarPorId.mockResolvedValue(vendaPendente);
    mocks.vendaRepository.atualizar.mockResolvedValue({ id: 'v-1', status: 'recusada' });

    const resultado = await service.decidir('v-1', 'recusada', admin);

    expect(resultado).toEqual({ id: 'v-1', status: 'recusada' });
    expect(mocks.vendaRepository.atualizar).toHaveBeenCalledWith('v-1', {
      status: 'recusada',
      confirmado_por: 'admin-1',
      confirmado_em: '2026-11-14T12:00:00.000Z',
    });
    expect(mocks.equipeRepository.listarTimesDoGerente).not.toHaveBeenCalled();
    expect(mocks.vendaRepository.converterLeadDoCliente).not.toHaveBeenCalled();
  });

  test('falha ao converter o lead não desfaz a confirmação da venda', async () => {
    const atualizada = { id: 'v-1', status: 'confirmada' };
    const espiaErro = jest.spyOn(console, 'error').mockImplementation(() => {});
    mocks.vendaRepository.buscarPorId.mockResolvedValue(vendaPendente);
    mocks.vendaRepository.atualizar.mockResolvedValue(atualizada);
    mocks.vendaRepository.converterLeadDoCliente.mockRejectedValue(new Error('banco fora do ar'));

    try {
      const resultado = await service.decidir('v-1', 'confirmada', admin);

      expect(resultado).toBe(atualizada);
      expect(espiaErro).toHaveBeenCalledTimes(1);
    } finally {
      espiaErro.mockRestore();
    }
  });
});

describe('VendaService.vgv', () => {
  const vendas = [
    { status: 'confirmada', valor: '100000' },
    { status: 'pendente', valor: 500000 },
    { status: 'confirmada', valor: 250000.5 },
    { status: 'recusada', valor: 999 },
  ];

  test('soma apenas vendas confirmadas', async () => {
    mocks.vendaRepository.listarTodas.mockResolvedValue(vendas);

    const resultado = await service.vgv(admin);

    expect(resultado).toEqual({ total: 350000.5, quantidade: 2 });
  });

  test('sem vendas confirmadas retorna zero', async () => {
    mocks.vendaRepository.listarTodas.mockResolvedValue([{ status: 'pendente', valor: 10 }]);

    const resultado = await service.vgv(admin);

    expect(resultado).toEqual({ total: 0, quantidade: 0 });
  });

  test('admin filtra por equipe', async () => {
    mocks.equipeRepository.listar.mockResolvedValue(MEMBROS);
    mocks.vendaRepository.listarPorCorretores.mockResolvedValue(vendas);

    const resultado = await service.vgv(admin, { equipeId: 'eq-1' });

    expect(mocks.vendaRepository.listarPorCorretores).toHaveBeenCalledWith(['cor-1', 'cor-2']);
    expect(mocks.equipeRepository.listarTimesPorDiretoria).not.toHaveBeenCalled();
    expect(resultado.quantidade).toBe(2);
  });

  test('admin filtra por diretoria (todas as equipes dela)', async () => {
    mocks.equipeRepository.listarTimesPorDiretoria.mockResolvedValue([{ id: 'eq-1' }, { id: 'eq-2' }]);
    mocks.equipeRepository.listar.mockResolvedValue(MEMBROS);
    mocks.vendaRepository.listarPorCorretores.mockResolvedValue([]);

    await service.vgv(admin, { diretoriaId: 'dir-1' });

    expect(mocks.equipeRepository.listarTimesPorDiretoria).toHaveBeenCalledWith('dir-1');
    expect(mocks.vendaRepository.listarPorCorretores).toHaveBeenCalledWith(['cor-1', 'cor-2', 'cor-3']);
  });

  test('gerente não amplia o escopo com filtros: continua restrito à própria equipe', async () => {
    mocks.equipeRepository.listarTimesDoGerente.mockResolvedValue([{ id: 'eq-1' }]);
    mocks.equipeRepository.listar.mockResolvedValue(MEMBROS);
    mocks.vendaRepository.listarPorCorretores.mockResolvedValue([]);

    await service.vgv(gerente, { equipeId: 'eq-9' });

    expect(mocks.vendaRepository.listarPorCorretores).toHaveBeenCalledWith(['cor-1', 'cor-2']);
    expect(mocks.equipeRepository.listarTimesPorDiretoria).not.toHaveBeenCalled();
  });

  test('corretor vê só o próprio VGV', async () => {
    mocks.vendaRepository.listarPorCorretores.mockResolvedValue([{ status: 'confirmada', valor: 70 }]);

    const resultado = await service.vgv(corretor);

    expect(mocks.vendaRepository.listarPorCorretores).toHaveBeenCalledWith(['cor-1']);
    expect(resultado).toEqual({ total: 70, quantidade: 1 });
  });
});
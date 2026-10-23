
'use strict';

const {
  ClienteService,
  validarCliente,
} = require('./clienteservice');

const cliente = {
  id: 'cliente-1',
  nome: 'Maria Silva',
  email: 'maria@exemplo.com',
  telefone: '81999998888',
  observacoes: null,
  criado_em: '2026-10-22T12:00:00Z',
  corretor: { id: 'corretor-1', nome: 'João' },
  lead: null,
};

function preparar(overrides = {}) {
  const repo = {
    listar: jest.fn().mockResolvedValue([cliente]),
    listarPorCorretor: jest.fn().mockResolvedValue([cliente]),
    buscarPorId: jest.fn().mockResolvedValue(cliente),
    criar: jest.fn().mockResolvedValue(cliente),
    atualizar: jest.fn().mockResolvedValue(cliente),
    ...overrides,
  };

  return {
    repo,
    service: new ClienteService({ clienteRepository: repo }),
  };
}

describe('ClienteService', () => {
  test('rejeita nome e telefone vazios', () => {
    const erros = validarCliente({
      nome: '',
      telefone: '',
    });

    expect(erros.nome).toBeDefined();
    expect(erros.telefone).toBeDefined();
  });

  test('aceita dados válidos', () => {
    expect(validarCliente({
      nome: 'Maria',
      email: 'maria@exemplo.com',
      telefone: '81999998888',
    })).toEqual({});
  });

  test('admin lista os clientes', async () => {
    const { service, repo } = preparar();

    const lista = await service.listar({
      id: 'admin-1',
      cargo: 'admin',
    });

    expect(repo.listar).toHaveBeenCalled();
    expect(lista[0].nome).toBe('Maria Silva');
  });

  test('corretor lista apenas seus clientes', async () => {
    const { service, repo } = preparar();

    await service.listar({
      id: 'corretor-1',
      cargo: 'corretor',
    });

    expect(repo.listarPorCorretor)
      .toHaveBeenCalledWith('corretor-1');
  });

  test('cliente inexistente retorna NOT_FOUND', async () => {
    const { service } = preparar({
      buscarPorId: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.buscarPorId('inexistente', {
        id: 'admin-1',
        cargo: 'admin',
      })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  test('corretor não acessa cliente de outro', async () => {
    const { service } = preparar();

    await expect(
      service.buscarPorId('cliente-1', {
        id: 'outro-corretor',
        cargo: 'corretor',
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  test('corretor cria cliente vinculado a si', async () => {
    const { service, repo } = preparar();

    await service.criar({
      nome: 'Maria Silva',
      email: 'maria@exemplo.com',
      telefone: '(81) 99999-8888',
    }, {
      id: 'corretor-1',
      cargo: 'corretor',
    });

    expect(repo.criar).toHaveBeenCalledWith(
      expect.objectContaining({
        corretorId: 'corretor-1',
        telefone: '81999998888',
      })
    );
  });

  test('corretor não pode reatribuir cliente', async () => {
    const { service } = preparar();

    await expect(
      service.atualizar(
        'cliente-1',
        { corretorId: 'outro-corretor' },
        { id: 'corretor-1', cargo: 'corretor' }
      )
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

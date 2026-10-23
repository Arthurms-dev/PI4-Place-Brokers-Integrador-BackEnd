'use strict';

const { EmpreendimentoService } = require('./empreendimentoService');

function configurar() {
  const row = { id: 'p1', nome: 'Publicado', publicado: true, book_url: 'privado', tabela_url: 'privado' };
  const repo = {
    listar: jest.fn().mockResolvedValue([row]),
    buscarPorId: jest.fn().mockResolvedValue(row),
    atualizar: jest.fn().mockImplementation(async (_, changes) => ({ ...row, ...changes })),
  };
  const service = new EmpreendimentoService({ empreendimentoRepository: repo, uploadService: {} });
  return { service, repo, row };
}

describe('cache público do catálogo', () => {
  afterEach(() => jest.restoreAllMocks());

  it('compartilha requisições públicas simultâneas e evita consulta repetida por 30s', async () => {
    const { service, repo } = configurar();
    const [a, b] = await Promise.all([service.listar(null), service.listar(null)]);
    expect(repo.listar).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(a[0]).not.toHaveProperty('book_url');
    expect(a[0]).not.toHaveProperty('tabela_url');
    await service.listar(null);
    expect(repo.listar).toHaveBeenCalledTimes(1);
  });

  it('não aplica cache de visitantes para administrador ou corretor', async () => {
    const { service, repo } = configurar();
    await service.listar(null);
    const interno = { cargo: 'admin', ativo: true, status: 'aprovado' };
    await service.listar(interno);
    await service.listar(interno);
    expect(repo.listar).toHaveBeenNthCalledWith(2, { apenasPublicados: false });
    expect(repo.listar).toHaveBeenNthCalledWith(3, { apenasPublicados: false });
  });

  it('expira cache ao fim do TTL', async () => {
    const { service, repo } = configurar();
    const tempo = jest.spyOn(Date, 'now');
    tempo.mockReturnValue(100000);
    await service.listar(null);
    tempo.mockReturnValue(130001);
    await service.listar(null);
    expect(repo.listar).toHaveBeenCalledTimes(2);
  });

  it('invalida o cache depois de atualização de empreendimento', async () => {
    const { service, repo } = configurar();
    await service.listar(null);
    await service.atualizar('p1', { descricao: 'Atualizado' });
    await service.listar(null);
    expect(repo.listar).toHaveBeenCalledTimes(2);
  });

  it('não deixa uma leitura anterior à atualização repovoar o cache', async () => {
    const { service, repo, row } = configurar();
    let resolver;
    repo.listar.mockImplementationOnce(() => new Promise((resolve) => { resolver = resolve; }));
    const antiga = service.listar(null);
    await service.atualizar('p1', { descricao: 'Nova' });
    const nova = await service.listar(null);
    resolver([row]);
    await antiga;
    await service.listar(null);
    expect(nova[0].nome).toBe('Publicado');
    expect(repo.listar).toHaveBeenCalledTimes(2);
  });

  it('não armazena falhas e permite nova tentativa', async () => {
    const { service, repo, row } = configurar();
    repo.listar.mockRejectedValueOnce(new Error('falha temporária')).mockResolvedValueOnce([row]);
    await expect(service.listar(null)).rejects.toThrow('falha temporária');
    await expect(service.listar(null)).resolves.toHaveLength(1);
    expect(repo.listar).toHaveBeenCalledTimes(2);
  });
});

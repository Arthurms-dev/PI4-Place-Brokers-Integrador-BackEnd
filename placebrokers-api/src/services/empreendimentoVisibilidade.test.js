'use strict';

const { EmpreendimentoService } = require('./empreendimentoService');

function criarServico(
  row = {
    id: 'imovel-1',
    publicado: false,
    book_url: null,
    tabela_url: null,
  }
) {
  const empreendimentoRepository = {
    listar: jest.fn().mockResolvedValue([row]),
    buscarPorId: jest.fn().mockResolvedValue(row),
  };

  return {
    servico: new EmpreendimentoService({
      empreendimentoRepository,
      uploadService: {},
    }),
    empreendimentoRepository,
  };
}

const corretor = {
  cargo: 'corretor',
  ativo: true,
  status: 'aprovado',
};

const admin = {
  cargo: 'admin',
  ativo: true,
  status: 'aprovado',
};

const gerente = {
  cargo: 'gerente',
  ativo: true,
  status: 'aprovado',
};

describe('visibilidade comercial de empreendimentos', () => {
  test('visitante anônimo só recebe publicados na listagem', async () => {
    const { servico, empreendimentoRepository } = criarServico();

    await servico.listar(null);

    expect(empreendimentoRepository.listar).toHaveBeenCalledWith({
      apenasPublicados: true,
    });
  });

  test.each([corretor, admin, gerente])(
    'equipe aprovada pode consultar rascunhos: %p',
    async (usuario) => {
      const { servico, empreendimentoRepository } = criarServico();

      await servico.listar(usuario);

      expect(empreendimentoRepository.listar).toHaveBeenCalledWith({
        apenasPublicados: false,
      });
    }
  );

  test.each([
    { cargo: 'corretor', ativo: true, status: 'pendente' },
    { cargo: 'corretor', ativo: true, status: 'recusado' },
    { cargo: 'corretor', ativo: false, status: 'aprovado' },
    { cargo: 'gerente', ativo: true, status: 'pendente' },
    { cargo: 'gerente', ativo: false, status: 'aprovado' },
    { cargo: 'viabilizador', ativo: true, status: 'aprovado' },
  ])(
    'conta sem acesso interno não recebe rascunhos: %p',
    async (usuario) => {
      const { servico, empreendimentoRepository } = criarServico();

      await servico.listar(usuario);

      expect(empreendimentoRepository.listar).toHaveBeenCalledWith({
        apenasPublicados: true,
      });
    }
  );

  test('visitante não consulta detalhe de rascunho', async () => {
    const { servico } = criarServico();

    await expect(
      servico.buscarPorId('imovel-1', null)
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  test.each([corretor, admin, gerente])(
    'usuário interno aprovado consulta detalhe de rascunho: %p',
    async (usuario) => {
      const { servico } = criarServico();

      await expect(
        servico.buscarPorId('imovel-1', usuario)
      ).resolves.toMatchObject({
        id: 'imovel-1',
      });
    }
  );

  test('gerente pendente não consulta detalhe de rascunho', async () => {
    const { servico } = criarServico();

    await expect(
      servico.buscarPorId('imovel-1', {
        cargo: 'gerente',
        ativo: true,
        status: 'pendente',
      })
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  test('visitante consulta detalhe publicado', async () => {
    const { servico } = criarServico({
      id: 'imovel-2',
      publicado: true,
      book_url: null,
      tabela_url: null,
    });

    await expect(
      servico.buscarPorId('imovel-2', null)
    ).resolves.toMatchObject({
      id: 'imovel-2',
    });
  });
});

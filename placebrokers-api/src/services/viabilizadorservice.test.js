'use strict';

const { ViabilizadorService, pendenciasDe } = require('./viabilizadorservice');

const DIA = 86400000;

const produto = (extra = {}) => ({
  id: 'p1',
  nome: 'Araçá Prime',
  slug: 'araca-prime',
  status: 'lancamento',
  cidade: 'Recife',
  uf: 'PE',
  bairro: 'Boa Viagem',
  disponivel: true,
  publicado: true,
  preco_min: 300000,
  preco_max: 500000,
  latitude: -8.04,
  longitude: -34.88,
  book_url: 'https://x/book.pdf',
  tabela_url: 'https://x/tabela.pdf',
  documentos_atualizados_em: new Date().toISOString(),
  construtora_id: 'c1',
  construtora: { id: 'c1', nome: 'Construtora Mar' },
  ...extra,
});

const usuario = { id: 'viab-1', cargo: 'viabilizador', construtora_id: 'c1' };
const pdf = { mimetype: 'application/pdf', buffer: Buffer.from('%PDF') };

function createDeps(overrides = {}) {
  return {
    viabilizadorRepository: {
      listarProdutosDaConstrutora: jest.fn().mockResolvedValue([]),
      buscarConstrutora: jest.fn().mockResolvedValue({ id: 'c1', nome: 'Construtora Mar' }),
      buscarProduto: jest.fn().mockResolvedValue(produto()),
      atualizarProduto: jest.fn().mockImplementation(async (id, dados) => produto(dados)),
      visualizacoes: jest.fn().mockResolvedValue(0),
      leads: jest.fn().mockResolvedValue(0),
      visitas: jest.fn().mockResolvedValue(0),
      vendas: jest.fn().mockResolvedValue([]),
      ...overrides.viabilizadorRepository,
    },
    uploadService: {
      uploadDocumento: jest.fn().mockResolvedValue('https://x/novo.pdf'),
      ...overrides.uploadService,
    },
  };
}

describe('ViabilizadorService', () => {
  describe('listarProdutos', () => {
    test('devolve os produtos da construtora dele, no formato público e com as pendências', async () => {
      const deps = createDeps({ viabilizadorRepository: { listarProdutosDaConstrutora: jest.fn().mockResolvedValue([produto(), produto({ id: 'p2', book_url: null })]) } });
      const service = new ViabilizadorService(deps);

      const { construtora, produtos } = await service.listarProdutos(usuario);

      expect(deps.viabilizadorRepository.listarProdutosDaConstrutora).toHaveBeenCalledWith('c1');
      expect(construtora).toEqual({ id: 'c1', nome: 'Construtora Mar' });
      expect(produtos).toHaveLength(2);
      expect(produtos[0]).toMatchObject({ id: 'p1', nome: 'Araçá Prime', construtora: 'Construtora Mar', temBook: true, pendencias: [] });
      expect(produtos[1]).toMatchObject({ temBook: false, pendencias: ['sem_book'] });
      expect(produtos[0].book_url).toBeUndefined(); // o endereço do PDF nunca sai do back
    });

    test('viabilizador sem construtora vinculada: lista vazia, sem consultar produtos', async () => {
      const deps = createDeps();
      const service = new ViabilizadorService(deps);

      const r = await service.listarProdutos({ id: 'viab-2', cargo: 'viabilizador', construtora_id: null });

      expect(r).toEqual({ construtora: null, produtos: [] });
      expect(deps.viabilizadorRepository.listarProdutosDaConstrutora).not.toHaveBeenCalled();
    });
  });

  describe('atualizarProduto', () => {
    test('caso de sucesso: muda disponibilidade e preço', async () => {
      const deps = createDeps();
      const service = new ViabilizadorService(deps);

      const resultado = await service.atualizarProduto('p1', { disponivel: false, precoMin: 320000 }, usuario);

      expect(deps.viabilizadorRepository.atualizarProduto).toHaveBeenCalledWith('p1', { disponivel: false, preco_min: 320000 });
      expect(resultado).toMatchObject({ disponivel: false, precoMin: 320000 });
    });

    test('produto de outro viabilizador: lança FORBIDDEN sem atualizar', async () => {
      const deps = createDeps({ viabilizadorRepository: { buscarProduto: jest.fn().mockResolvedValue(produto({ construtora_id: 'outra' })) } });
      const service = new ViabilizadorService(deps);

      await expect(service.atualizarProduto('p1', { disponivel: false }, usuario)).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
      expect(deps.viabilizadorRepository.atualizarProduto).not.toHaveBeenCalled();
    });

    test('viabilizador sem construtora vinculada: lança FORBIDDEN mesmo em produto sem construtora', async () => {
      const deps = createDeps({ viabilizadorRepository: { buscarProduto: jest.fn().mockResolvedValue(produto({ construtora_id: null })) } });
      const service = new ViabilizadorService(deps);

      await expect(service.atualizarProduto('p1', { disponivel: false }, { id: 'viab-2', construtora_id: null })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(deps.viabilizadorRepository.atualizarProduto).not.toHaveBeenCalled();
    });

    test('produto inexistente: lança NOT_FOUND', async () => {
      const deps = createDeps({ viabilizadorRepository: { buscarProduto: jest.fn().mockResolvedValue(null) } });
      const service = new ViabilizadorService(deps);

      await expect(service.atualizarProduto('x', { disponivel: true }, usuario)).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
    });

    test('preço máximo menor que o mínimo: lança erro de validação no campo', async () => {
      const deps = createDeps();
      const service = new ViabilizadorService(deps);

      await expect(service.atualizarProduto('p1', { precoMax: 100000 }, usuario)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        fieldErrors: { precoMax: expect.any(String) },
      });
      expect(deps.viabilizadorRepository.atualizarProduto).not.toHaveBeenCalled();
    });

    test('preço negativo ou que não é número: lança erro de validação', async () => {
      const service = new ViabilizadorService(createDeps());

      await expect(service.atualizarProduto('p1', { precoMin: -5 }, usuario)).rejects.toMatchObject({ fieldErrors: { precoMin: expect.any(String) } });
      await expect(service.atualizarProduto('p1', { precoMin: 'abc' }, usuario)).rejects.toMatchObject({ fieldErrors: { precoMin: expect.any(String) } });
    });

    test('disponivel que não é booleano: lança erro de validação', async () => {
      const service = new ViabilizadorService(createDeps());

      await expect(service.atualizarProduto('p1', { disponivel: 'sim' }, usuario)).rejects.toMatchObject({ fieldErrors: { disponivel: expect.any(String) } });
    });

    test('campos que não são dele (nome, publicado) são ignorados e, sem nada a mudar, dá erro', async () => {
      const deps = createDeps();
      const service = new ViabilizadorService(deps);

      await expect(service.atualizarProduto('p1', { nome: 'Outro nome', publicado: false }, usuario)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(deps.viabilizadorRepository.atualizarProduto).not.toHaveBeenCalled();
    });

    test('preço pode ser limpo (null)', async () => {
      const deps = createDeps();
      const service = new ViabilizadorService(deps);

      await service.atualizarProduto('p1', { precoMax: null }, usuario);

      expect(deps.viabilizadorRepository.atualizarProduto).toHaveBeenCalledWith('p1', { preco_max: null });
    });
  });

  describe('enviarDocumento', () => {
    test('caso de sucesso: sobe o PDF, grava o endereço e a data da atualização', async () => {
      const deps = createDeps();
      const service = new ViabilizadorService(deps);

      const resultado = await service.enviarDocumento('p1', 'book', pdf, usuario);

      expect(deps.uploadService.uploadDocumento).toHaveBeenCalledWith('araca-prime', 'book', pdf);
      const [, dados] = deps.viabilizadorRepository.atualizarProduto.mock.calls[0];
      expect(dados.book_url).toBe('https://x/novo.pdf');
      expect(typeof dados.documentos_atualizados_em).toBe('string');
      expect(resultado.temBook).toBe(true);
    });

    test('tabela vai para tabela_url', async () => {
      const deps = createDeps();
      const service = new ViabilizadorService(deps);

      await service.enviarDocumento('p1', 'tabela', pdf, usuario);

      expect(deps.viabilizadorRepository.atualizarProduto.mock.calls[0][1].tabela_url).toBe('https://x/novo.pdf');
    });

    test('tipo inválido, sem arquivo ou arquivo que não é PDF: erro de validação sem subir nada', async () => {
      const deps = createDeps();
      const service = new ViabilizadorService(deps);

      await expect(service.enviarDocumento('p1', 'contrato', pdf, usuario)).rejects.toMatchObject({ code: 'VALIDATION_ERROR', fieldErrors: { tipo: expect.any(String) } });
      await expect(service.enviarDocumento('p1', 'book', undefined, usuario)).rejects.toMatchObject({ code: 'VALIDATION_ERROR', fieldErrors: { arquivo: expect.any(String) } });
      await expect(service.enviarDocumento('p1', 'book', { mimetype: 'image/png' }, usuario)).rejects.toMatchObject({ code: 'VALIDATION_ERROR', fieldErrors: { arquivo: expect.any(String) } });
      expect(deps.uploadService.uploadDocumento).not.toHaveBeenCalled();
    });

    test('produto de outro viabilizador: lança FORBIDDEN e não sobe o arquivo', async () => {
      const deps = createDeps({ viabilizadorRepository: { buscarProduto: jest.fn().mockResolvedValue(produto({ construtora_id: 'outra' })) } });
      const service = new ViabilizadorService(deps);

      await expect(service.enviarDocumento('p1', 'book', pdf, usuario)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(deps.uploadService.uploadDocumento).not.toHaveBeenCalled();
    });
  });

  describe('oportunidades', () => {
    test('período fora de 7, 30 e 90 dias: lança erro de validação', async () => {
      const service = new ViabilizadorService(createDeps());

      await expect(service.oportunidades(usuario, 15)).rejects.toMatchObject({ code: 'VALIDATION_ERROR', fieldErrors: { dias: expect.any(String) } });
    });

    test('conta a procura, pontua (visualização 1, lead 5, visita 8) e ordena do mais disputado', async () => {
      const deps = createDeps({
        viabilizadorRepository: {
          listarProdutosDaConstrutora: jest.fn().mockResolvedValue([produto({ id: 'a', nome: 'A' }), produto({ id: 'b', nome: 'B' })]),
          visualizacoes: jest.fn().mockImplementation(async (id) => (id === 'a' ? 10 : 3)),
          leads: jest.fn().mockImplementation(async (id) => (id === 'a' ? 0 : 4)),
          visitas: jest.fn().mockImplementation(async (id) => (id === 'a' ? 1 : 2)),
          vendas: jest.fn().mockImplementation(async (id) => (id === 'b'
            ? [{ valor: 400000, status: 'confirmada' }, { valor: 300000, status: 'confirmada' }, { valor: 999999, status: 'pendente' }, { valor: 1, status: 'recusada' }]
            : [])),
        },
      });
      const service = new ViabilizadorService(deps);

      const r = await service.oportunidades(usuario, 30);

      expect(r.periodoDias).toBe(30);
      expect(r.produtos.map((p) => p.id)).toEqual(['b', 'a']); // b: 3 + 20 + 16 = 39; a: 10 + 0 + 8 = 18
      expect(r.produtos[0]).toMatchObject({ pontuacao: 39, visualizacoes: 3, leads: 4, visitas: 2, vendas: { confirmadas: 2, pendentes: 1, vgv: 700000 } });
      expect(r.resumo).toMatchObject({ produtos: 2, visualizacoes: 13, leads: 4, visitas: 3, vgv: 700000 });
    });

    test('só considera os dados a partir do início do período', async () => {
      const deps = createDeps({ viabilizadorRepository: { listarProdutosDaConstrutora: jest.fn().mockResolvedValue([produto()]) } });
      const service = new ViabilizadorService(deps);

      await service.oportunidades(usuario, 7);

      const desde = new Date(deps.viabilizadorRepository.leads.mock.calls[0][1]).getTime();
      expect(Math.abs(Date.now() - 7 * DIA - desde)).toBeLessThan(5000);
    });

    test('traz a construtora dele na resposta', async () => {
      const service = new ViabilizadorService(createDeps());

      const r = await service.oportunidades(usuario);

      expect(r.construtora).toEqual({ id: 'c1', nome: 'Construtora Mar' });
    });

    test('sem construtora vinculada: sem produtos e totais zerados', async () => {
      const service = new ViabilizadorService(createDeps());

      const r = await service.oportunidades({ id: 'viab-2', construtora_id: null });

      expect(r.construtora).toBeNull();
      expect(r.produtos).toEqual([]);
    });

    test('sem produtos: devolve lista vazia e totais zerados', async () => {
      const service = new ViabilizadorService(createDeps());

      const r = await service.oportunidades(usuario);

      expect(r.produtos).toEqual([]);
      expect(r.resumo).toMatchObject({ produtos: 0, visualizacoes: 0, leads: 0, visitas: 0, vgv: 0 });
    });
  });

  describe('pendenciasDe', () => {
    test('produto completo e com documentos recentes: sem pendências', () => {
      expect(pendenciasDe(produto())).toEqual([]);
    });

    test('aponta o que falta', () => {
      const p = produto({ book_url: null, tabela_url: null, preco_min: null, latitude: null });
      expect(pendenciasDe(p)).toEqual(expect.arrayContaining(['sem_book', 'sem_tabela', 'sem_preco', 'sem_coordenadas']));
    });

    test('documentos com mais de 30 dias ou sem data de atualização ficam desatualizados', () => {
      const velho = produto({ documentos_atualizados_em: new Date(Date.now() - 45 * DIA).toISOString() });
      const semData = produto({ documentos_atualizados_em: null });
      expect(pendenciasDe(velho)).toContain('documentos_desatualizados');
      expect(pendenciasDe(semData)).toContain('documentos_desatualizados');
    });
  });
});
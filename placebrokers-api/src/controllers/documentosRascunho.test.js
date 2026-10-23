'use strict';

jest.mock('../config/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}));

jest.mock('../repositories/empreendimentoRepository', () => ({
  EmpreendimentoRepository: jest.fn().mockImplementation(() => ({
    buscarPorId: jest.fn(),
  })),
}));

jest.mock('../services/uploadService', () => ({
  UploadService: jest.fn().mockImplementation(() => ({
    assinarDocumento: jest.fn(),
  })),
}));

const {
  EmpreendimentoService,
  usuarioPodeVerRascunhos,
} = require('../services/empreendimentoService');

const {
  EmpreendimentoRepository,
} = require('../repositories/empreendimentoRepository');

const { supabaseAdmin } = require('../config/supabase');

const documentos = require('./documentosEmpreendimentoController');

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

const gerentePendente = {
  cargo: 'gerente',
  ativo: true,
  status: 'pendente',
};

const gerenteInativo = {
  cargo: 'gerente',
  ativo: false,
  status: 'aprovado',
};

const pendente = {
  cargo: 'corretor',
  ativo: true,
  status: 'pendente',
};

const anonimo = null;

const docId = '1Byl2TJjsjT83TZYYz6-s2XDQV0A27vlF';

const linkBook =
  'https://drive.google.com/file/d/16qQ0d2RJsbCLGE9OSxT1G_uC4T_-TDV2/view';

const empreendimento = {
  id: 'imovel-teste',
  publicado: false,
  book_url: linkBook,
  tabela_url: null,
};

const repoDoController =
  EmpreendimentoRepository.mock.results[0].value;

function resposta() {
  return {
    statusCode: 200,
    body: null,

    status(n) {
      this.statusCode = n;
      return this;
    },

    json(data) {
      this.body = data;
      return this;
    },
  };
}

function queryComDocumentos() {
  const q = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),

    order: jest.fn().mockResolvedValue({
      data: [
        {
          id: 'registro-1',
          empreendimento_id: empreendimento.id,
          tipo: 'tabela',
          titulo: 'Tabela Fase 1',
          fase: 'Fase 1',
          drive_file_id: docId,
          status: 'aprovado',
          validade_ate: null,
          fonte_atualizada_em: '2026-10-20T12:00:00Z',
        },
      ],
      error: null,
    }),

    maybeSingle: jest.fn().mockResolvedValue({
      data: {
        id: 'registro-1',
        empreendimento_id: empreendimento.id,
        tipo: 'tabela',
        drive_file_id: docId,
        status: 'aprovado',
        validade_ate: null,
      },
      error: null,
    }),
  };

  supabaseAdmin.from.mockReturnValue(q);

  return q;
}

beforeEach(() => {
  repoDoController.buscarPorId
    .mockReset()
    .mockResolvedValue(empreendimento);

  supabaseAdmin.from.mockReset();
});

describe('books e tabelas comerciais de rascunhos', () => {
  test('permite acesso interno somente a contas autorizadas', () => {
    expect(usuarioPodeVerRascunhos(corretor)).toBe(true);
    expect(usuarioPodeVerRascunhos(admin)).toBe(true);
    expect(usuarioPodeVerRascunhos(gerente)).toBe(true);

    expect(usuarioPodeVerRascunhos(anonimo)).toBe(false);
    expect(usuarioPodeVerRascunhos(pendente)).toBe(false);
    expect(usuarioPodeVerRascunhos(gerentePendente)).toBe(false);
    expect(usuarioPodeVerRascunhos(gerenteInativo)).toBe(false);
  });

  test.each([corretor, gerente])(
    '%p pode abrir book legado de rascunho',
    async (usuario) => {
      const service = new EmpreendimentoService({
        empreendimentoRepository: {
          buscarPorId: jest.fn().mockResolvedValue(empreendimento),
        },
        uploadService: {
          assinarDocumento: jest.fn(),
        },
      });

      await expect(
        service.urlDoDocumento(empreendimento.id, 'book', usuario)
      ).resolves.toMatchObject({
        url: linkBook,
      });
    }
  );

  test.each([corretor, gerente])(
    '%p pode listar book e tabela por fase de rascunho',
    async (usuario) => {
      queryComDocumentos();

      const res = resposta();

      await documentos.listar(
        {
          params: { id: empreendimento.id },
          user: usuario,
        },
        res
      );

      expect(res.statusCode).toBe(200);

      expect(res.body.map((d) => d.tipo)).toEqual([
        'book',
        'tabela',
      ]);

      expect(res.body[1].fase).toBe('Fase 1');
    }
  );

  test.each([corretor, gerente])(
    '%p pode abrir tabela aprovada de rascunho',
    async (usuario) => {
      queryComDocumentos();

      const res = resposta();

      await documentos.abrir(
        {
          params: {
            id: empreendimento.id,
            docId: 'registro-1',
          },
          user: usuario,
        },
        res
      );

      expect(res.statusCode).toBe(200);

      expect(res.body.url).toBe(
        `https://drive.google.com/file/d/${docId}/view`
      );
    }
  );

  test.each([
    anonimo,
    pendente,
    gerentePendente,
    gerenteInativo,
  ])(
    'usuário sem autorização não lista documentos de rascunho: %p',
    async (usuario) => {
      queryComDocumentos();

      const res = resposta();

      await documentos.listar(
        {
          params: { id: empreendimento.id },
          user: usuario,
        },
        res
      );

      expect(res.statusCode).toBe(404);
      expect(supabaseAdmin.from).not.toHaveBeenCalled();
    }
  );

  test.each([
    anonimo,
    gerentePendente,
    gerenteInativo,
  ])(
    'usuário sem autorização não abre tabela de rascunho: %p',
    async (usuario) => {
      queryComDocumentos();

      const res = resposta();

      await documentos.abrir(
        {
          params: {
            id: empreendimento.id,
            docId: 'registro-1',
          },
          user: usuario,
        },
        res
      );

      expect(res.statusCode).toBe(404);
      expect(supabaseAdmin.from).not.toHaveBeenCalled();
    }
  );
});

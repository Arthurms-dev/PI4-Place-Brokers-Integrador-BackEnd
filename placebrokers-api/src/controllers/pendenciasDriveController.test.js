'use strict';

jest.mock('../config/supabase', () => ({ supabaseAdmin: { from: jest.fn() } }));
const { supabaseAdmin } = require('../config/supabase');
const { listar } = require('./pendenciasDriveController');
const { requireRole } = require('../middlewares/requireRole');

const response = () => ({
  code: 0, body: null,
  status(n) { this.code = n; return this; },
  json(data) { this.body = data; return this; },
});

beforeEach(() => jest.resetAllMocks());

function mockPendencias(pendencias, empreendimentos = []) {
  const q = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue({ data: pendencias, error: null }),
    in: jest.fn().mockResolvedValue({ data: empreendimentos, error: null }),
  };
  supabaseAdmin.from.mockReturnValue(q);
  return q;
}

describe('Pendências do Drive - leitura para administrador', () => {
  test('fila vazia retorna 200 e nenhum item', async () => {
    const query = mockPendencias([]);
    const res = response();
    await listar({}, res);
    expect(res.code).toBe(200);
    expect(res.body).toEqual({ itens: [], totalExibido: 0, haMais: false });
    expect(query.in).not.toHaveBeenCalled();
  });

  test('lista pendências com vínculo seguro, sem expor credenciais', async () => {
    mockPendencias([{
      id: 'p1', arquivo_nome: 'Tabela de novembro.pdf', motivo: 'ARQUIVO_MODIFICADO',
      tipo: 'tabela', fase: 'Fase 1', status: 'pendente',
      drive_file_id: 'ABCDEFGHIJKLMNOPQR', empreendimento_id: 'emp1',
      documento_id: 'doc1', criado_em: '2026-10-24T15:00:00Z',
      drive_modificado_em: '2026-10-24T14:00:00Z',
    }], [{ id: 'emp1', nome: 'Brisa do Mar' }]);
    const res = response();
    await listar({}, res);
    expect(res.code).toBe(200);
    expect(res.body.itens).toHaveLength(1);
    expect(res.body.itens[0]).toMatchObject({
      empreendimentoNome: 'Brisa do Mar', tipo: 'tabela', fase: 'Fase 1',
      driveUrl: 'https://drive.google.com/file/d/ABCDEFGHIJKLMNOPQR/view',
    });
    expect(JSON.stringify(res.body)).not.toContain('SERVICE_ROLE');
  });

  test('PDF sem vínculo não é associado por inferência', async () => {
    mockPendencias([{
      id: 'p2', arquivo_nome: 'novo.pdf', motivo: 'PDF_NOVO_SEM_VINCULO',
      status: 'pendente', drive_file_id: 'ABCDEFGHIJKLMNOPQR',
      empreendimento_id: null, documento_id: null,
    }]);
    const res = response();
    await listar({}, res);
    expect(res.body.itens[0].empreendimentoId).toBeNull();
    expect(res.body.itens[0].empreendimentoNome).toBeNull();
  });

  test('falha na leitura retorna 500 sem expor detalhes de DB', async () => {
    supabaseAdmin.from.mockReturnValue({
      select: () => ({
        eq: () => ({ order: () => ({ limit: async () => ({ error: { message: 'DB secret' } }) }) }),
      }),
    });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = response();
    await listar({}, res);
    expect(res.code).toBe(500);
    expect(res.body.message).not.toContain('DB secret');
    spy.mockRestore();
  });

  test('rota deve exigir cargo admin', () => {
    const naoAutorizado = response();
    requireRole('admin')({ user: { cargo: 'corretor' } }, naoAutorizado, jest.fn());
    expect(naoAutorizado.code).toBe(403);
    const next = jest.fn();
    requireRole('admin')({ user: { cargo: 'admin' } }, response(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

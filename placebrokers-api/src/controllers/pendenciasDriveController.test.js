'use strict';

jest.mock('../config/supabase', () => ({ supabaseAdmin: { from: jest.fn(), rpc: jest.fn() } }));
const { supabaseAdmin } = require('../config/supabase');
const { listar, revisar } = require('./pendenciasDriveController');
const { requireRole } = require('../middlewares/requireRole');

const response = () => ({
  code: 0, body: null,
  status(n) { this.code = n; return this; },
  json(data) { this.body = data; return this; },
});

describe('revisão de pendências', () => {
  const request = (body = {}) => ({
    params: { pendenciaId: '20000000-0000-0000-0000-000000000001' },
    userId: '00000000-0000-0000-0000-000000000001', user: { cargo: 'admin' },
    body: { acao: 'ignorar', revisao: 0, motivo: 'Documento institucional.', ...body },
  });
  test('usa apenas uma transação RPC e identifica revisor pela sessão', async () => {
    supabaseAdmin.rpc.mockResolvedValue({ data: { status: 'ignorado', revisao: 1 } });
    const req = request({ p_revisor: 'atacante', status: 'aprovado' });
    const res = response();
    await revisar(req, res);
    expect(res.code).toBe(200);
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('revisar_pendencia_drive', {
      p_id: req.params.pendenciaId, p_revisor: req.userId, p_revisao: 0, p_acao: 'ignorar',
      p_dados: { motivo: 'Documento institucional.', confirmarAprovacao: false },
    });
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });
  test.each([undefined, { cargo: 'corretor' }, { cargo: 'gerente' }])('não escreve para não ADM: %p', async (user) => {
    const req = request(); req.user = user;
    const res = response(); await revisar(req, res);
    expect([401, 403]).toContain(res.code); expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });
  test('validação impede RPC sem revisão ou confirmação', async () => {
    const res = response();
    await revisar(request({ acao: 'concluir', revisao: undefined }), res);
    expect(res.code).toBe(400); expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
  });
  test('conflito de revisão retorna 409', async () => {
    supabaseAdmin.rpc.mockResolvedValue({ error: { message: 'REVISAO_CONFLITO' } });
    const res = response(); await revisar(request(), res);
    expect(res.code).toBe(409);
  });
  test('falha de banco não expõe detalhes internos', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    supabaseAdmin.rpc.mockResolvedValue({ error: { message: 'SEGREDO DO BANCO' } });
    const res = response(); await revisar(request(), res);
    expect(res.code).toBe(500); expect(JSON.stringify(res.body)).not.toContain('SEGREDO');
    spy.mockRestore();
  });
  test('consulta histórico pela situação selecionada', async () => {
    const query = mockPendencias([]);
    const res = response(); await listar({ query: { status: 'ignorado' } }, res);
    expect(query.eq).toHaveBeenCalledWith('status', 'ignorado');
  });
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

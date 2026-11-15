'use strict';

jest.mock('../config/supabase', () => ({
  supabaseAdmin: { from: jest.fn() },
}));

const { supabaseAdmin } = require('../config/supabase');
const { VendaRepository } = require('./vendaRepository');

function criarCadeia(resultado = { data: null, error: null }) {
  const cadeia = {};
  for (const metodo of ['select', 'insert', 'update', 'eq', 'in', 'order']) {
    cadeia[metodo] = jest.fn(() => cadeia);
  }
  cadeia.maybeSingle = jest.fn(() => Promise.resolve(resultado));
  cadeia.single = jest.fn(() => Promise.resolve(resultado));
  cadeia.then = (resolver, rejeitar) => Promise.resolve(resultado).then(resolver, rejeitar);
  return cadeia;
}

let repo;

beforeEach(() => {
  supabaseAdmin.from.mockReset();
  repo = new VendaRepository();
});

describe('VendaRepository - consultas', () => {
  test('listarTodas busca na tabela vendas, mais recentes primeiro', async () => {
    const linhas = [{ id: 'v-1' }, { id: 'v-2' }];
    const cadeia = criarCadeia({ data: linhas, error: null });
    supabaseAdmin.from.mockReturnValue(cadeia);

    const resultado = await repo.listarTodas();

    expect(resultado).toBe(linhas);
    expect(supabaseAdmin.from).toHaveBeenCalledWith('vendas');
    expect(cadeia.order).toHaveBeenCalledWith('criado_em', { ascending: false });
  });

  test('listarTodas propaga o erro do banco', async () => {
    supabaseAdmin.from.mockReturnValue(criarCadeia({ data: null, error: new Error('falha no banco') }));

    await expect(repo.listarTodas()).rejects.toThrow('falha no banco');
  });

  test('listarPorCorretor filtra pelo corretor', async () => {
    const cadeia = criarCadeia({ data: [{ id: 'v-1' }], error: null });
    supabaseAdmin.from.mockReturnValue(cadeia);

    const resultado = await repo.listarPorCorretor('cor-1');

    expect(resultado).toEqual([{ id: 'v-1' }]);
    expect(cadeia.eq).toHaveBeenCalledWith('corretor_id', 'cor-1');
  });

  test('listarPorCorretor propaga o erro do banco', async () => {
    supabaseAdmin.from.mockReturnValue(criarCadeia({ data: null, error: new Error('falha na consulta') }));

    await expect(repo.listarPorCorretor('cor-1')).rejects.toThrow('falha na consulta');
  });

  test('listarPorCorretores com lista vazia nem chama o banco', async () => {
    const resultado = await repo.listarPorCorretores([]);

    expect(resultado).toEqual([]);
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });

  test('listarPorCorretores filtra pelos ids informados', async () => {
    const cadeia = criarCadeia({ data: [{ id: 'v-1' }], error: null });
    supabaseAdmin.from.mockReturnValue(cadeia);

    const resultado = await repo.listarPorCorretores(['cor-1', 'cor-2']);

    expect(resultado).toEqual([{ id: 'v-1' }]);
    expect(cadeia.in).toHaveBeenCalledWith('corretor_id', ['cor-1', 'cor-2']);
  });

  test('listarPorCorretores propaga o erro do banco', async () => {
    supabaseAdmin.from.mockReturnValue(criarCadeia({ data: null, error: new Error('falha na consulta') }));

    await expect(repo.listarPorCorretores(['cor-1'])).rejects.toThrow('falha na consulta');
  });

  test('buscarPorId devolve a venda encontrada', async () => {
    const cadeia = criarCadeia({ data: { id: 'v-1' }, error: null });
    supabaseAdmin.from.mockReturnValue(cadeia);

    const resultado = await repo.buscarPorId('v-1');

    expect(resultado).toEqual({ id: 'v-1' });
    expect(cadeia.eq).toHaveBeenCalledWith('id', 'v-1');
  });

  test('buscarPorId devolve null quando não existe', async () => {
    supabaseAdmin.from.mockReturnValue(criarCadeia({ data: null, error: null }));

    const resultado = await repo.buscarPorId('v-x');

    expect(resultado).toBeNull();
  });

  test('buscarPorId propaga o erro do banco', async () => {
    supabaseAdmin.from.mockReturnValue(criarCadeia({ data: null, error: new Error('timeout') }));

    await expect(repo.buscarPorId('v-1')).rejects.toThrow('timeout');
  });
});

describe('VendaRepository - escrita', () => {
  test('criar insere os dados e devolve a linha criada', async () => {
    const dados = { corretor_id: 'cor-1', valor: 100, status: 'pendente' };
    const cadeia = criarCadeia({ data: { id: 'v-1', ...dados }, error: null });
    supabaseAdmin.from.mockReturnValue(cadeia);

    const resultado = await repo.criar(dados);

    expect(resultado).toEqual({ id: 'v-1', ...dados });
    expect(supabaseAdmin.from).toHaveBeenCalledWith('vendas');
    expect(cadeia.insert).toHaveBeenCalledWith(dados);
  });

  test('criar propaga o erro do banco', async () => {
    supabaseAdmin.from.mockReturnValue(criarCadeia({ data: null, error: new Error('violação de chave') }));

    await expect(repo.criar({})).rejects.toThrow('violação de chave');
  });

  test('atualizar altera apenas a venda indicada', async () => {
    const cadeia = criarCadeia({ data: { id: 'v-1', status: 'confirmada' }, error: null });
    supabaseAdmin.from.mockReturnValue(cadeia);

    const resultado = await repo.atualizar('v-1', { status: 'confirmada' });

    expect(resultado).toEqual({ id: 'v-1', status: 'confirmada' });
    expect(cadeia.update).toHaveBeenCalledWith({ status: 'confirmada' });
    expect(cadeia.eq).toHaveBeenCalledWith('id', 'v-1');
  });

  test('atualizar propaga o erro do banco', async () => {
    supabaseAdmin.from.mockReturnValue(criarCadeia({ data: null, error: new Error('sem permissão') }));

    await expect(repo.atualizar('v-1', {})).rejects.toThrow('sem permissão');
  });
});

describe('VendaRepository.converterLeadDoCliente', () => {
  test('sem cliente informado não faz nada', async () => {
    await repo.converterLeadDoCliente(null);

    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });

  test('cliente inexistente não atualiza nenhum lead', async () => {
    supabaseAdmin.from.mockReturnValueOnce(criarCadeia({ data: null, error: null }));

    await repo.converterLeadDoCliente('cli-x');

    expect(supabaseAdmin.from).toHaveBeenCalledTimes(1);
    expect(supabaseAdmin.from).toHaveBeenCalledWith('clientes');
  });

  test('cliente sem lead de origem não atualiza nenhum lead', async () => {
    supabaseAdmin.from.mockReturnValueOnce(criarCadeia({ data: { lead_id: null }, error: null }));

    await repo.converterLeadDoCliente('cli-1');

    expect(supabaseAdmin.from).toHaveBeenCalledTimes(1);
  });

  test('marca como convertido o lead de origem do cliente', async () => {
    const cadeiaCliente = criarCadeia({ data: { lead_id: 'lead-9' }, error: null });
    const cadeiaLead = criarCadeia({ data: null, error: null });
    supabaseAdmin.from.mockReturnValueOnce(cadeiaCliente).mockReturnValueOnce(cadeiaLead);

    await repo.converterLeadDoCliente('cli-1');

    expect(supabaseAdmin.from).toHaveBeenNthCalledWith(1, 'clientes');
    expect(cadeiaCliente.select).toHaveBeenCalledWith('lead_id');
    expect(cadeiaCliente.eq).toHaveBeenCalledWith('id', 'cli-1');
    expect(supabaseAdmin.from).toHaveBeenNthCalledWith(2, 'leads');
    expect(cadeiaLead.update).toHaveBeenCalledWith({ status: 'convertido' });
    expect(cadeiaLead.eq).toHaveBeenCalledWith('id', 'lead-9');
  });
});
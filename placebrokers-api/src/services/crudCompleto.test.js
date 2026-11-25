'use strict';

// CRUD completo das 4 entidades (clientes, agendamentos, leads, vendas) e dos 2 relacionamentos
// (lead → atividades, cliente → agendamentos), com a proteção de dono em cada exclusão/edição.

const { ClienteService } = require('./clienteservice');
const { AgendamentoService } = require('./agendamentoService');
const { LeadService } = require('./leadService');
const { LeadAtividadeService } = require('./leadAtividadeService');
const { VendaService } = require('./vendaservice');

const corretor = { id: 'corretor-1', cargo: 'corretor' };
const outro = { id: 'corretor-2', cargo: 'corretor' };
const admin = { id: 'admin-1', cargo: 'admin' };

describe('ClienteService.excluir', () => {
  const cliente = { id: 'c1', nome: 'Maria', corretor: { id: 'corretor-1' }, lead: null };
  const repo = (vinculos = { vendas: 0, agendamentos: 0 }) => ({
    buscarPorId: jest.fn().mockResolvedValue(cliente),
    contarVinculos: jest.fn().mockResolvedValue(vinculos),
    excluir: jest.fn().mockResolvedValue(true),
  });

  test('corretor de outra carteira recebe 403', async () => {
    const r = repo();
    await expect(new ClienteService({ clienteRepository: r }).excluir('c1', outro)).rejects.toMatchObject({ statusCode: 403 });
    expect(r.excluir).not.toHaveBeenCalled();
  });

  test('cliente com venda não sai (409)', async () => {
    const r = repo({ vendas: 1, agendamentos: 0 });
    await expect(new ClienteService({ clienteRepository: r }).excluir('c1', corretor)).rejects.toMatchObject({ statusCode: 409 });
  });

  test('cliente com agendamento pede para excluir os agendamentos antes (409)', async () => {
    const r = repo({ vendas: 0, agendamentos: 2 });
    await expect(new ClienteService({ clienteRepository: r }).excluir('c1', corretor)).rejects.toMatchObject({ statusCode: 409 });
  });

  test('dono exclui cliente sem vínculos', async () => {
    const r = repo();
    await new ClienteService({ clienteRepository: r }).excluir('c1', corretor);
    expect(r.excluir).toHaveBeenCalledWith('c1');
  });
});

describe('AgendamentoService: detalhe, edição e exclusão', () => {
  const base = {
    id: 'a1', tipo: 'visita_imovel', data_hora: '2026-12-02T13:00:00Z', status: 'agendado',
    cliente: { id: 'c1' }, corretor: { id: 'corretor-1' }, empreendimento: { id: 'e1' },
  };
  const repo = (atual = base) => ({
    buscarPorId: jest.fn().mockResolvedValue(atual),
    atualizarDetalhes: jest.fn().mockImplementation(async (id, campos) => ({ ...atual, ...campos })),
    excluir: jest.fn().mockResolvedValue(true),
  });

  test('visita realizada não pode ser excluída', async () => {
    const r = repo({ ...base, status: 'realizado' });
    await expect(new AgendamentoService({ agendamentoRepository: r }).excluir('a1')).rejects.toMatchObject({ statusCode: 409 });
    expect(r.excluir).not.toHaveBeenCalled();
  });

  test('agendamento futuro é excluído', async () => {
    const r = repo();
    await new AgendamentoService({ agendamentoRepository: r }).excluir('a1');
    expect(r.excluir).toHaveBeenCalledWith('a1');
  });

  test('visita sem imóvel é recusada ao tirar o empreendimento', async () => {
    const r = repo();
    await expect(new AgendamentoService({ agendamentoRepository: r }).atualizarDetalhes('a1', { empreendimentoId: null }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('PATCH sem nenhum campo devolve 400', async () => {
    const r = repo();
    await expect(new AgendamentoService({ agendamentoRepository: r }).atualizar('a1', {})).rejects.toMatchObject({ statusCode: 400 });
  });

  test('atualiza observações', async () => {
    const r = repo();
    const ag = await new AgendamentoService({ agendamentoRepository: r }).atualizar('a1', { observacoes: '  Levar tabela  ' });
    expect(r.atualizarDetalhes).toHaveBeenCalledWith('a1', { observacoes: 'Levar tabela' });
    expect(ag.observacoes).toBe('Levar tabela');
  });
});

describe('LeadService: lead do corretor', () => {
  const leadSite = { id: 'l1', nome: 'Ana', origem: 'site', corretor: { id: 'corretor-1' } };
  const leadProprio = { ...leadSite, id: 'l2', origem: 'corretor' };
  const repo = (lead, extra = {}) => ({
    buscarPorId: jest.fn().mockResolvedValue(lead),
    buscarPorContato: jest.fn().mockResolvedValue(null),
    criarDoCorretor: jest.fn().mockImplementation(async (d) => ({ id: 'novo', ...d, origem: 'corretor', status: 'novo', corretor: { id: d.corretorId } })),
    atualizarDados: jest.fn().mockImplementation(async (id, d) => ({ ...lead, ...d })),
    contarVinculos: jest.fn().mockResolvedValue({ clientes: 0, agendamentos: 0 }),
    excluir: jest.fn().mockResolvedValue(true),
    ...extra,
  });
  const servico = (r) => new LeadService({ leadRepository: r, clienteRepository: {} });

  test('cria na carteira do corretor logado, com telefone normalizado', async () => {
    const r = repo(null);
    const lead = await servico(r).criarDoCorretor({ nome: ' Carla ', telefone: '(81) 99876-5432', corretorId: 'outro' }, corretor);
    expect(r.criarDoCorretor).toHaveBeenCalledWith(expect.objectContaining({ nome: 'Carla', telefone: '81998765432', corretorId: 'corretor-1' }));
    expect(lead.corretor.id).toBe('corretor-1');
  });

  test('contato repetido vira 409 (mesmo telefone = mesma pessoa)', async () => {
    const r = repo(null, { buscarPorContato: jest.fn().mockResolvedValue({ id: 'existente' }) });
    await expect(servico(r).criarDoCorretor({ nome: 'Carla', telefone: '81998765432' }, corretor)).rejects.toMatchObject({ statusCode: 409 });
  });

  test('corretor não exclui lead do site', async () => {
    const r = repo(leadSite);
    await expect(servico(r).excluir('l1', corretor)).rejects.toMatchObject({ statusCode: 403 });
  });

  test('lead de outro corretor dá 403 até para ver', async () => {
    const r = repo(leadProprio);
    await expect(servico(r).buscarPorId('l2', outro)).rejects.toMatchObject({ statusCode: 403 });
  });

  test('lead com cliente ou agendamento não sai', async () => {
    const r = repo(leadProprio, { contarVinculos: jest.fn().mockResolvedValue({ clientes: 1, agendamentos: 0 }) });
    await expect(servico(r).excluir('l2', corretor)).rejects.toMatchObject({ statusCode: 409 });
  });

  test('exclui lead próprio sem vínculos', async () => {
    const r = repo(leadProprio);
    await servico(r).excluir('l2', corretor);
    expect(r.excluir).toHaveBeenCalledWith('l2');
  });

  test('admin exclui lead do site sem vínculos', async () => {
    const r = repo(leadSite);
    await servico(r).excluir('l1', admin);
    expect(r.excluir).toHaveBeenCalledWith('l1');
  });
});

describe('LeadAtividadeService: editar e excluir', () => {
  const lead = { id: 'l1', corretor: { id: 'corretor-1' } };
  const atividade = { id: 't1', lead_id: 'l1', autor_id: 'corretor-1', tipo: 'ligacao', descricao: 'Ligou', proximo_contato_em: null, criado_em: '2026-11-20T12:00:00Z' };
  const servico = (ativ = atividade) => {
    const atividadeRepository = {
      buscarPorId: jest.fn().mockResolvedValue(ativ),
      atualizar: jest.fn().mockImplementation(async (id, c) => ({ ...ativ, ...c })),
      excluir: jest.fn().mockResolvedValue(true),
    };
    return { atividadeRepository, s: new LeadAtividadeService({ leadRepository: { buscarPorId: jest.fn().mockResolvedValue(lead) }, atividadeRepository }) };
  };

  test('atividade de outro lead dá 404', async () => {
    const { s } = servico({ ...atividade, lead_id: 'l9' });
    await expect(s.buscar('l1', 't1', corretor)).rejects.toMatchObject({ statusCode: 404 });
  });

  test('só o autor edita', async () => {
    const { s } = servico({ ...atividade, autor_id: 'admin-1' });
    await expect(s.atualizar('l1', 't1', corretor, { descricao: 'x' })).rejects.toMatchObject({ statusCode: 403 });
  });

  test('autor corrige a descrição', async () => {
    const { s } = servico();
    const a = await s.atualizar('l1', 't1', corretor, { descricao: ' Retornar amanhã ' });
    expect(a.descricao).toBe('Retornar amanhã');
  });

  test('autor exclui', async () => {
    const { s, atividadeRepository } = servico();
    await s.excluir('l1', 't1', corretor);
    expect(atividadeRepository.excluir).toHaveBeenCalledWith('t1');
  });
});

describe('VendaService: corretor corrige ou exclui a venda pendente', () => {
  const pendente = { id: 'v1', corretor_id: 'corretor-1', status: 'pendente' };
  const servico = (venda = pendente) => {
    const vendaRepository = {
      buscarPorId: jest.fn().mockResolvedValue(venda),
      atualizar: jest.fn().mockImplementation(async (id, c) => ({ ...venda, ...c })),
      excluir: jest.fn().mockResolvedValue(true),
    };
    return { vendaRepository, s: new VendaService({ vendaRepository, equipeRepository: {}, clienteRepository: {} }) };
  };

  test('venda confirmada não muda (VGV)', async () => {
    const { s } = servico({ ...pendente, status: 'confirmada' });
    await expect(s.editar('v1', { valor: 1 }, corretor)).rejects.toMatchObject({ statusCode: 409 });
    await expect(s.excluir('v1', corretor)).rejects.toMatchObject({ statusCode: 409 });
  });

  test('venda de outro corretor dá 403', async () => {
    const { s } = servico();
    await expect(s.excluir('v1', outro)).rejects.toMatchObject({ statusCode: 403 });
  });

  test('corrige valor e unidade', async () => {
    const { s, vendaRepository } = servico();
    await s.editar('v1', { valor: '250000', unidade: ' Torre B,  704 ' }, corretor);
    expect(vendaRepository.atualizar).toHaveBeenCalledWith('v1', { valor: 250000, unidade: 'Torre B, 704' });
  });

  test('valor inválido dá 400', async () => {
    const { s } = servico();
    await expect(s.editar('v1', { valor: 0 }, corretor)).rejects.toMatchObject({ statusCode: 400 });
  });

  test('exclui a própria venda pendente', async () => {
    const { s, vendaRepository } = servico();
    await s.excluir('v1', corretor);
    expect(vendaRepository.excluir).toHaveBeenCalledWith('v1');
  });
});

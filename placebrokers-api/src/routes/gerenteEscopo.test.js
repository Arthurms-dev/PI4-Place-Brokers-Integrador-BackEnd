'use strict';

// Teste de rota: GET /gerente nunca solicita a lista geral de leads/agenda.
const mockEquipe = {
  listarTimesDoGerente: jest.fn(),
  listarMembrosPorEquipes: jest.fn(),
  listarDiretorias: jest.fn(),
  listar: jest.fn(),
};
const mockLeads = { listar: jest.fn(), listarPorCorretores: jest.fn() };
const mockAgenda = { listar: jest.fn(), listarPorCorretores: jest.fn() };

jest.mock('../repositories/equiperepository', () => ({
  EquipeRepository: jest.fn().mockImplementation(() => mockEquipe),
}));
jest.mock('../services/leadService', () => ({
  LeadService: jest.fn().mockImplementation(() => mockLeads),
}));
jest.mock('../services/agendamentoService', () => ({
  AgendamentoService: jest.fn().mockImplementation(() => mockAgenda),
}));
jest.mock('../repositories/leadRepository', () => ({ LeadRepository: jest.fn() }));
jest.mock('../repositories/agendamentoRepository', () => ({ AgendamentoRepository: jest.fn() }));
jest.mock('../repositories/clienteRepository', () => ({ ClienteRepository: jest.fn() }));
jest.mock('../middlewares/authMiddleware', () => ({ authMiddleware: (req, res, next) => next() }));

const router = require('./gerenteroutes');
function handler(path) {
  const rota = router.stack.find((x) => x.route?.path === path && x.route.methods.get);
  if (!rota) throw new Error('Rota nao encontrada: ' + path);
  return rota.route.stack[0].handle;
}
function resposta() {
  return { statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
}
async function get(path) {
  const res = resposta();
  await handler(path)({ user: { id: 'g-1', cargo: 'gerente' } }, res);
  return res;
}
beforeEach(() => {
  jest.clearAllMocks();
  mockEquipe.listarTimesDoGerente.mockResolvedValue([{id:'time-a', nome:'Equipe A', gerente_id:'g-1'}]);
  mockEquipe.listarMembrosPorEquipes.mockResolvedValue([
    { id:'c-1', equipe_id:'time-a', cargo:'corretor', status:'aprovado', ativo:true },
    { id:'c-2', equipe_id:'time-a', cargo:'corretor', status:'aprovado', ativo:false },
    // Defesa adicional: mesmo que o repositorio entregue dado indevido,
    // contexto() nao autoriza membro de outra equipe.
    { id:'c-3', equipe_id:'time-z', cargo:'corretor', status:'aprovado', ativo:true },
    { id:'c-4', equipe_id:'time-a', cargo:'corretor', status:'pendente', ativo:true },
  ]);
  mockEquipe.listarDiretorias.mockResolvedValue([]);
  mockLeads.listarPorCorretores.mockResolvedValue([{ id:'lead-a', corretor:{id:'c-1'} }]);
  mockAgenda.listarPorCorretores.mockResolvedValue([{ id:'agenda-a', corretor:{id:'c-2'} }]);
});

test('leads: consulta somente os IDs da equipe, preservando o formato da resposta', async () => {
  const res = await get('/leads');
  expect(res.statusCode).toBe(200);
  expect(res.body).toEqual({ leads: [{ id:'lead-a', corretor:{id:'c-1'} }] });
  expect(mockEquipe.listarMembrosPorEquipes).toHaveBeenCalledWith(['time-a']);
  expect(mockLeads.listarPorCorretores).toHaveBeenCalledWith(['c-1','c-2']);
  expect(mockLeads.listar).not.toHaveBeenCalled();
  expect(mockEquipe.listar).not.toHaveBeenCalled();
});

test('agendamentos: consulta somente IDs da equipe, sem listar agenda geral', async () => {
  const res = await get('/agendamentos');
  expect(res.statusCode).toBe(200);
  expect(res.body).toEqual({ agendamentos: [{ id:'agenda-a', corretor:{id:'c-2'} }] });
  expect(mockAgenda.listarPorCorretores).toHaveBeenCalledWith(['c-1','c-2']);
  expect(mockAgenda.listar).not.toHaveBeenCalled();
});

test('gerente sem equipe nao consulta a tabela de leads', async () => {
  mockEquipe.listarTimesDoGerente.mockResolvedValue([]);
  mockEquipe.listarMembrosPorEquipes.mockResolvedValue([]);
  const res = await get('/leads');
  expect(res.body).toEqual({leads:[]});
  expect(mockLeads.listarPorCorretores).not.toHaveBeenCalled();
  expect(mockEquipe.listarMembrosPorEquipes).toHaveBeenCalledWith([]);
});

test('gerente sem equipe nao consulta a tabela de agendamentos', async () => {
  mockEquipe.listarTimesDoGerente.mockResolvedValue([]);
  mockEquipe.listarMembrosPorEquipes.mockResolvedValue([]);
  const res = await get('/agendamentos');
  expect(res.body).toEqual({agendamentos:[]});
  expect(mockAgenda.listarPorCorretores).not.toHaveBeenCalled();
});

test('GET equipe continua retornando equipes e membros no contrato original', async () => {
  const res = await get('/equipe');
  expect(res.statusCode).toBe(200);
  expect(res.body.equipes).toMatchObject([{id:'time-a',nome:'Equipe A'}]);
  expect(res.body.membros.map((x)=>x.id)).toEqual(['c-1','c-2']);
});

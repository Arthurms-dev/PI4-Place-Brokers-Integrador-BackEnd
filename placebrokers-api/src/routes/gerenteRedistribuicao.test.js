'use strict';

// Regressao: buscarPorId usa a relacao `corretor:profiles (id, nome)`,
// portanto o responsavel retornado e lead.corretor.id (nao lead.corretor_id).
const mockEquipeRepository = {
  listarTimesDoGerente: jest.fn(),
  listarMembrosPorEquipes: jest.fn(),
  listarDiretorias: jest.fn(),
};
const mockLeadRepository = { buscarPorId: jest.fn() };
const mockLeadService = { atribuirCorretor: jest.fn() };

jest.mock('../repositories/equiperepository', () => ({
  EquipeRepository: jest.fn().mockImplementation(() => mockEquipeRepository),
}));
jest.mock('../repositories/leadRepository', () => ({
  LeadRepository: jest.fn().mockImplementation(() => mockLeadRepository),
}));
jest.mock('../services/leadService', () => ({
  LeadService: jest.fn().mockImplementation(() => mockLeadService),
}));
jest.mock('../services/agendamentoService', () => ({
  AgendamentoService: jest.fn().mockImplementation(() => ({ listar: jest.fn() })),
}));
jest.mock('../repositories/agendamentoRepository', () => ({ AgendamentoRepository: jest.fn() }));
jest.mock('../repositories/clienteRepository', () => ({ ClienteRepository: jest.fn() }));
jest.mock('../middlewares/authMiddleware', () => ({
  authMiddleware: (req, res, next) => next(),
}));

const router = require('./gerenteroutes');
const rota = router.stack.find((item) => item.route?.path === '/leads/:id/corretor' && item.route.methods.patch);
if (!rota) throw new Error('Rota PATCH /gerente/leads/:id/corretor ausente');
const redistribuir = rota.route.stack[0].handle;

function resposta() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
}

async function executar(corretorId = 'c2') {
  const res = resposta();
  await redistribuir({
    user: { id: 'g1', cargo: 'gerente' },
    params: { id: 'lead-1' },
    body: { corretorId },
  }, res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEquipeRepository.listarTimesDoGerente.mockResolvedValue([{ id: 'time-1', gerente_id: 'g1' }]);
  mockEquipeRepository.listarMembrosPorEquipes.mockResolvedValue([
    { id: 'c1', equipe_id: 'time-1', cargo: 'corretor', status: 'aprovado', ativo: true },
    { id: 'c2', equipe_id: 'time-1', cargo: 'corretor', status: 'aprovado', ativo: true },
    { id: 'c3', equipe_id: 'time-2', cargo: 'corretor', status: 'aprovado', ativo: true },
    { id: 'c4', equipe_id: 'time-1', cargo: 'corretor', status: 'aprovado', ativo: false },
  ]);
  mockEquipeRepository.listarDiretorias.mockResolvedValue([]);
  mockLeadRepository.buscarPorId.mockResolvedValue({ id: 'lead-1', corretor: { id: 'c1', nome: 'Corretor 1' } });
  mockLeadService.atribuirCorretor.mockResolvedValue({ id: 'lead-1', corretor: { id: 'c2' } });
});

describe('redistribuicao de leads do gerente', () => {
  test('permite lead da propria equipe para outro corretor ativo da equipe', async () => {
    const res = await executar('c2');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ lead: { id: 'lead-1', corretor: { id: 'c2' } } });
    expect(mockLeadService.atribuirCorretor).toHaveBeenCalledWith('lead-1', 'c2');
  });

  test('nao permite transferir um lead que pertence a outra equipe', async () => {
    mockLeadRepository.buscarPorId.mockResolvedValue({ id: 'lead-1', corretor: { id: 'c3' } });
    const res = await executar('c2');
    expect(res.statusCode).toBe(403);
    expect(mockLeadService.atribuirCorretor).not.toHaveBeenCalled();
  });

  test('nao permite transferir lead sem responsavel', async () => {
    mockLeadRepository.buscarPorId.mockResolvedValue({ id: 'lead-1', corretor: null });
    const res = await executar('c2');
    expect(res.statusCode).toBe(403);
    expect(mockLeadService.atribuirCorretor).not.toHaveBeenCalled();
  });

  test('nao permite selecionar corretor de outra equipe', async () => {
    const res = await executar('c3');
    expect(res.statusCode).toBe(400);
    expect(mockLeadRepository.buscarPorId).not.toHaveBeenCalled();
    expect(mockLeadService.atribuirCorretor).not.toHaveBeenCalled();
  });

  test('nao permite selecionar corretor inativo', async () => {
    const res = await executar('c4');
    expect(res.statusCode).toBe(400);
    expect(mockLeadService.atribuirCorretor).not.toHaveBeenCalled();
  });

  test('retorna 404 quando o lead nao existe', async () => {
    mockLeadRepository.buscarPorId.mockResolvedValue(null);
    const res = await executar('c2');
    expect(res.statusCode).toBe(404);
    expect(mockLeadService.atribuirCorretor).not.toHaveBeenCalled();
  });
});

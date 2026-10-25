'use strict';

// Testa os middlewares reais sem conexão com Supabase.
const mockBuscarCliente = jest.fn();
const mockListarCarteira = jest.fn();
const mockListarGeral = jest.fn();
const mockCriarAgendamento = jest.fn();

jest.mock('../repositories/agendamentoRepository', () => ({
  AgendamentoRepository: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../repositories/clienteRepository', () => ({
  ClienteRepository: jest.fn().mockImplementation(() => ({ buscarPorId: mockBuscarCliente })),
}));
jest.mock('../services/agendamentoService', () => ({
  AgendamentoService: jest.fn().mockImplementation(() => ({ listarPorCorretor: mockListarCarteira })),
}));
jest.mock('../controllers/agendamentoController', () => ({
  AgendamentoController: jest.fn().mockImplementation(() => ({
    listar: mockListarGeral,
    criar: mockCriarAgendamento,
    remarcar: jest.fn(),
    atualizarStatus: jest.fn(),
    _handleError: jest.fn((res, error) => res.status(500).json({ error: error.message })),
  })),
}));
jest.mock('../middlewares/authMiddleware', () => ({ authMiddleware: jest.fn((req, res, next) => next()) }));
jest.mock('../middlewares/requireRole', () => ({ requireRole: jest.fn(() => (req, res, next) => next()) }));

const router = require('./agendamentoRoutes');
function camada(method, path = '/') {
  const route = router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]);
  if (!route) throw new Error('Rota nao encontrada');
  return route.route.stack.map((item) => item.handle);
}
function resposta() {
  return {
    statusCode: 200,
    status(value) { this.statusCode = value; return this; },
    json(body) { this.body = body; return this; },
  };
}
const vendedor = { id: 'corretor-a', cargo: 'corretor' };
const admin = { id: 'admin-a', cargo: 'admin' };
const clienteDaCarteira = { id: 'cliente-a', corretor: { id: 'corretor-a' }, lead: { id: 'lead-a' } };

beforeEach(() => {
  jest.clearAllMocks();
  mockBuscarCliente.mockResolvedValue(clienteDaCarteira);
  mockListarCarteira.mockResolvedValue([{ id: 'agenda-a' }]);
});

test('GET corretor consulta somente sua carteira na origem', async () => {
  const [handler] = camada('get');
  const res = resposta();
  await handler({ user: vendedor }, res);
  expect(mockListarCarteira).toHaveBeenCalledWith('corretor-a');
  expect(mockListarGeral).not.toHaveBeenCalled();
  expect(res.body).toEqual({ agendamentos: [{ id: 'agenda-a' }] });
});

test('GET admin continua com listagem geral', async () => {
  const [handler] = camada('get');
  await handler({ user: admin }, resposta());
  expect(mockListarGeral).toHaveBeenCalledTimes(1);
  expect(mockListarCarteira).not.toHaveBeenCalled();
});

test('POST corretor nao agenda cliente da carteira de outro corretor', async () => {
  const [autorizar] = camada('post');
  mockBuscarCliente.mockResolvedValue({ id: 'cliente-b', corretor: { id: 'corretor-b' } });
  const req = { user: vendedor, body: { clienteId: 'cliente-b', corretorId: 'corretor-b' } };
  const next = jest.fn();
  const res = resposta();
  await autorizar(req, res, next);
  expect(req.body.corretorId).toBe('corretor-a');
  expect(res.statusCode).toBe(404);
  expect(next).not.toHaveBeenCalled();
});

test('POST corretor valida cliente de sua carteira e ignora corretorId forjado', async () => {
  const [autorizar] = camada('post');
  const req = { user: vendedor, body: { clienteId: 'cliente-a', corretorId: 'corretor-b' } };
  const next = jest.fn();
  await autorizar(req, resposta(), next);
  expect(req.body.corretorId).toBe('corretor-a');
  expect(next).toHaveBeenCalledTimes(1);
});

test('POST corretor rejeita lead de origem de outra carteira', async () => {
  const [autorizar] = camada('post');
  const next = jest.fn();
  const res = resposta();
  await autorizar({ user: vendedor, body: { clienteId: 'cliente-a', leadOrigemId: 'lead-b' } }, res, next);
  expect(res.statusCode).toBe(400);
  expect(next).not.toHaveBeenCalled();
});

test('POST admin continua a criar agendamento de qualquer corretor', async () => {
  const [autorizar] = camada('post');
  const next = jest.fn();
  await autorizar({ user: admin, body: { clienteId: 'cliente-b', corretorId: 'corretor-b' } }, resposta(), next);
  expect(mockBuscarCliente).not.toHaveBeenCalled();
  expect(next).toHaveBeenCalledTimes(1);
});

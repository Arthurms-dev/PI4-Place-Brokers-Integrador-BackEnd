'use strict';

// Testar a camada de roteamento, inclusive o acesso direto sem interface React.
jest.mock('../controllers/vendacontroller', () => ({
  criar: jest.fn(), listar: jest.fn(), decidir: jest.fn(), vgv: jest.fn(),
}));
jest.mock('../controllers/corretorController', () => ({
  CorretorController: jest.fn().mockImplementation(() => ({ listar: jest.fn() })),
}));
jest.mock('../repositories/corretorRepository', () => ({
  CorretorRepository: jest.fn(),
}));
jest.mock('../middlewares/authMiddleware', () => ({
  authMiddleware: jest.fn((req, res, next) => next()),
}));

const { authMiddleware } = require('../middlewares/authMiddleware');
const vendasRouter = require('./vendaRoutes');
const corretoresRouter = require('./corretorRoutes');

function middlewareDeRota(router, method, path) {
  const layer = router.stack.find((l) => l.route?.path === path && l.route.methods[method]);
  if (!layer) throw new Error(`Rota inexistente: ${method.toUpperCase()} ${path}`);
  return layer.route.stack.slice(0, -1).map((l) => l.handle);
}

function testarPapel(middleware, cargo) {
  let status = 200;
  let payload = null;
  const res = {
    status(n) { status = n; return this; },
    json(v) { payload = v; return this; },
  };
  const next = jest.fn();
  middleware({ user: cargo ? { cargo } : null }, res, next);
  return { status, payload, liberado: next.mock.calls.length === 1 };
}

describe('GET /corretores', () => {
  const stack = middlewareDeRota(corretoresRouter, 'get', '/');
  test('exige autenticação antes da autorização', () => {
    expect(stack[0]).toBe(authMiddleware);
    expect(stack).toHaveLength(2);
  });
  test.each([null,'corretor','gerente','viabilizador'])(
    'bloqueia o cargo %p', (cargo) => {
      const r = testarPapel(stack[1], cargo);
      expect(r.liberado).toBe(false);
      expect(r.status).toBe(cargo ? 403 : 401);
    },
  );
  test('permite ADM', () => {
    expect(testarPapel(stack[1], 'admin').liberado).toBe(true);
  });
});

describe('rotas /vendas', () => {
  test('mantém autenticação global no router', () => {
    expect(vendasRouter.stack.some((l) => !l.route && l.handle === authMiddleware)).toBe(true);
  });
  test.each([
    ['post','/',['corretor']],
    ['get','/',['admin','gerente','corretor']],
    ['patch','/:id',['admin','gerente']],
    ['get','/vgv',['admin','gerente','corretor']],
  ])('%s %s: permite somente %p', (method,path,permitidos) => {
    const stack = middlewareDeRota(vendasRouter,method,path);
    expect(stack).toHaveLength(1);
    for(const cargo of ['admin','gerente','corretor','viabilizador']) {
      const r = testarPapel(stack[0],cargo);
      expect(r.liberado).toBe(permitidos.includes(cargo));
      if(!permitidos.includes(cargo)) expect(r.status).toBe(403);
    }
  });
});

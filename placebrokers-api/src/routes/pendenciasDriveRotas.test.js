'use strict';
jest.mock('../middlewares/authMiddleware', () => ({ authMiddleware: jest.fn() }));
jest.mock('../middlewares/optionalAuthMiddleware', () => ({ optionalAuthMiddleware: jest.fn() }));
jest.mock('../controllers/empreendimentoController', () => Object.fromEntries([
  'listar', 'buscarPorId', 'criar', 'atualizar', 'documento', 'criarTipologia',
  'atualizarTipologia', 'trocarCapa', 'adicionarFotos', 'removerFoto',
].map((chave) => [chave, jest.fn()])));
jest.mock('../controllers/documentosEmpreendimentoController', () => ({ listar: jest.fn(), abrir: jest.fn() }));
jest.mock('../controllers/documentosEmpreendimentoAdminController', () => ({ listar: jest.fn(), criar: jest.fn(), atualizar: jest.fn() }));
jest.mock('../controllers/pendenciasDriveController', () => ({ listar: jest.fn(), revisar: jest.fn() }));
const router = require('./empreendimentoRoutes');
const { authMiddleware } = require('../middlewares/authMiddleware');

test.each([['get', '/documentos/pendencias'], ['patch', '/documentos/pendencias/:pendenciaId']])(
  '%s %s exige sessão e cargo ADM antes de chegar ao controller', (metodo, caminho) => {
    const rota = router.stack.find((r) => r.route?.path === caminho && r.route.methods[metodo]);
    const handlers = rota.route.stack.map((r) => r.handle);
    expect(handlers[0]).toBe(authMiddleware);
    for (const cargo of [null, 'corretor', 'gerente', 'admin']) {
      const next = jest.fn();
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      handlers[1]({ user: cargo ? { cargo } : null }, res, next);
      expect(next.mock.calls.length).toBe(cargo === 'admin' ? 1 : 0);
      if (cargo !== 'admin') expect(res.status).toHaveBeenCalledWith(cargo ? 403 : 401);
    }
  });

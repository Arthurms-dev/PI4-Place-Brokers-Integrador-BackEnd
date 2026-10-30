// Testa a configuracao das rotas sem acessar o Supabase nem rede.
'use strict';

jest.mock('../controllers/authController', () => ({
  login: jest.fn(),
  register: jest.fn(),
  me: jest.fn(),
  atualizarMe: jest.fn(),
  alterarSenha: jest.fn(),
  esqueciSenha: jest.fn(),
  redefinirSenha: jest.fn(),
}));

jest.mock('../middlewares/authMiddleware', () => ({
  authMiddleware: jest.fn(),
}));

jest.mock('../middlewares/seguranca', () => ({
  limitadores: {
    loginPorIp: jest.fn(),
    loginPorEmail: jest.fn(),
    cadastro: jest.fn(),
    trocaDeSenha: jest.fn(),
    esqueciSenhaPorIp: jest.fn(),
    esqueciSenhaPorEmail: jest.fn(),
    redefinicaoSenha: jest.fn(),
  },
}));

const router = require('./authRoutes');
const controller = require('../controllers/authController');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { limitadores } = require('../middlewares/seguranca');

function funcoesDaRota(metodo, caminho) {
  const camada = router.stack.find((item) =>
    item.route?.path === caminho && item.route.methods[metodo]
  );
  if (!camada) throw new Error(`Rota ausente: ${metodo} ${caminho}`);
  return camada.route.stack.map((item) => item.handle);
}

describe('limitadores ligados as rotas de autenticacao', () => {
  test('POST /auth/login: bloqueios por IP e email ocorrem antes do login', () => {
    expect(funcoesDaRota('post', '/login')).toEqual([
      limitadores.loginPorIp, limitadores.loginPorEmail, controller.login,
    ]);
  });

  test('POST /auth/register: limite aplicado antes de criar cadastro', () => {
    expect(funcoesDaRota('post', '/register')).toEqual([
      limitadores.cadastro, controller.register,
    ]);
  });

  test('PATCH /auth/senha: autentica antes de limitar por usuario', () => {
    expect(funcoesDaRota('patch', '/senha')).toEqual([
      authMiddleware, limitadores.trocaDeSenha, controller.alterarSenha,
    ]);
  });

  test('POST /auth/esqueci-senha: limita por IP e por e-mail antes de gerar o link', () => {
    expect(funcoesDaRota('post', '/esqueci-senha')).toEqual([
      limitadores.esqueciSenhaPorIp, limitadores.esqueciSenhaPorEmail, controller.esqueciSenha,
    ]);
  });

  test('POST /auth/redefinir-senha: limite de tentativas antes de conferir o token', () => {
    expect(funcoesDaRota('post', '/redefinir-senha')).toEqual([
      limitadores.redefinicaoSenha, controller.redefinirSenha,
    ]);
  });

  test('GET /auth/me e PATCH /auth/me continuam autenticados', () => {
    expect(funcoesDaRota('get', '/me')).toEqual([
      authMiddleware, controller.me,
    ]);
    expect(funcoesDaRota('patch', '/me')).toEqual([
      authMiddleware, controller.atualizarMe,
    ]);
  });
});

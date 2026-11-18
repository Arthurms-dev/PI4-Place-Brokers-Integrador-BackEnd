'use strict';

jest.mock('./consultarSessao', () => ({ consultarSessao: jest.fn() }));

const { consultarSessao } = require('./consultarSessao');
const { authMiddleware } = require('./authMiddleware');

function chamar({ method = 'GET', baseUrl = '/leads', path = '/', perfil }) {
  consultarSessao.mockResolvedValue({ autenticado: true, profile: perfil });
  const req = { method, baseUrl, path, headers: { authorization: 'Bearer abc' } };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn();
  return authMiddleware(req, res, next).then(() => ({ req, res, next }));
}

const temporario = { id: 'u1', cargo: 'rh', status: 'aprovado', ativo: true, trocar_senha: true };

describe('troca obrigatória da senha temporária', () => {
  test('bloqueia as outras rotas enquanto a senha for temporária', async () => {
    const { res, next } = await chamar({ baseUrl: '/rh', path: '/candidaturas', perfil: temporario });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'PASSWORD_CHANGE_REQUIRED' }));
  });

  test.each([
    ['GET', '/auth', '/me'],
    ['PATCH', '/auth', '/senha'],
    ['PATCH', '/auth', '/senha/'],
  ])('libera %s %s%s', async (method, baseUrl, path) => {
    const { next, req } = await chamar({ method, baseUrl, path, perfil: temporario });
    expect(next).toHaveBeenCalled();
    expect(req.userId).toBe('u1');
  });

  test('não libera trocar a foto nem editar o perfil', async () => {
    for (const [method, path] of [['PUT', '/me/foto'], ['PATCH', '/me']]) {
      const { next, res } = await chamar({ method, baseUrl: '/auth', path, perfil: temporario });
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    }
  });

  test('quem já trocou a senha segue normal', async () => {
    const { next } = await chamar({ baseUrl: '/rh', path: '/candidaturas', perfil: { ...temporario, trocar_senha: false } });
    expect(next).toHaveBeenCalled();
  });

  test('perfil sem a coluna (antes da migração) segue normal', async () => {
    const { trocar_senha, ...semColuna } = temporario;
    const { next } = await chamar({ baseUrl: '/rh', path: '/candidaturas', perfil: semColuna });
    expect(next).toHaveBeenCalled();
  });
});

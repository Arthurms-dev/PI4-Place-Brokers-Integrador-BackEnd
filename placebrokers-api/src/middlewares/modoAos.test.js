'use strict';

const { exigirLoginEmTudo, modoAosLigado, rotaLiberada } = require('./modoAos');

const req = (method, path) => ({ method, path });

describe('modo AOS (login em tudo)', () => {
  test('só liga com EXIGIR_LOGIN_EM_TUDO=1', () => {
    expect(modoAosLigado({ EXIGIR_LOGIN_EM_TUDO: '1' })).toBe(true);
    expect(modoAosLigado({})).toBe(false);
    expect(modoAosLigado({ EXIGIR_LOGIN_EM_TUDO: 'true' })).toBe(false);
  });

  test('login, cadastro, saúde e documentação ficam abertos', () => {
    expect(rotaLiberada(req('POST', '/auth/login'))).toBe(true);
    expect(rotaLiberada(req('POST', '/auth/register'))).toBe(true);
    expect(rotaLiberada(req('POST', '/auth/renovar'))).toBe(true);
    expect(rotaLiberada(req('GET', '/health'))).toBe(true);
    expect(rotaLiberada(req('GET', '/docs/openapi.json'))).toBe(true);
    expect(rotaLiberada(req('OPTIONS', '/clientes'))).toBe(true);
  });

  test('rotas públicas do site passam a pedir login', () => {
    expect(rotaLiberada(req('GET', '/empreendimentos'))).toBe(false);
    expect(rotaLiberada(req('POST', '/leads'))).toBe(false);
    expect(rotaLiberada(req('GET', '/trabalhe-conosco/vagas'))).toBe(false);
    expect(rotaLiberada(req('GET', '/auth/login'))).toBe(false);
    expect(rotaLiberada(req('POST', '/auth/logout'))).toBe(false);
  });

  test('chama a autenticação só nas rotas fechadas', () => {
    const auth = jest.fn((r, s, next) => next());
    const next = jest.fn();
    const mw = exigirLoginEmTudo(auth);
    mw(req('POST', '/auth/login'), {}, next);
    expect(auth).not.toHaveBeenCalled();
    mw(req('GET', '/empreendimentos/'), {}, next);
    expect(auth).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(2);
  });
});

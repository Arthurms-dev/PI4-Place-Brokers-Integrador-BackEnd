'use strict';

const { normalizarTelefone } = require('./telefone');

const ok = (v) => normalizarTelefone(v).digitos;

describe('normalizarTelefone', () => {
  test('o mesmo celular digitado de jeitos diferentes vira um só número', () => {
    for (const v of ['(81) 99876-5432', '81 998765432', '+55 81 99876-5432', '5581998765432', '081998765432', '0 41 81 99876-5432']) {
      expect(ok(v)).toBe('81998765432');
    }
  });

  test('celular antigo sem o 9 ganha o 9', () => {
    expect(ok('(81) 8876-5432')).toBe('81988765432');
  });

  test('telefone fixo continua com 10 dígitos', () => {
    expect(ok('(81) 3222-1100')).toBe('8132221100');
  });

  test('recusa DDD inexistente, celular sem 9, números repetidos e tamanho errado', () => {
    expect(normalizarTelefone('(20) 99876-5432')).toEqual({ ok: false, erro: 'DDD inválido.' });
    expect(normalizarTelefone('(81) 89876-5432').ok).toBe(false);
    expect(normalizarTelefone('(81) 99999-9999').ok).toBe(false);
    expect(normalizarTelefone('(81) 1234-5678').ok).toBe(false);
    expect(normalizarTelefone('99876-5432').ok).toBe(false);
    expect(normalizarTelefone('').ok).toBe(false);
    expect(normalizarTelefone(undefined).ok).toBe(false);
  });
});

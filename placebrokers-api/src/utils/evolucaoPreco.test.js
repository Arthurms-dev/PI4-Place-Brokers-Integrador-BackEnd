'use strict';

const { evolucaoDoPreco } = require('./evolucaoPreco');

const AGORA = Date.parse('2027-06-01T12:00:00Z');

describe('evolução do preço "a partir de"', () => {
  test('com 90+ dias de histórico mostra de quanto para quanto', () => {
    const hist = [{ preco_min: '480000.00', registrado_em: '2026-11-18T05:00:00Z' }, { preco_min: '500000', registrado_em: '2027-02-01T00:00:00Z' }];
    expect(evolucaoDoPreco(hist, '530000', AGORA)).toEqual({ de: 480000, para: 530000, desde: '2026-11-18', variacao: 10.4 });
  });

  test('histórico curto (menos de 90 dias) ainda não mostra', () => {
    expect(evolucaoDoPreco([{ preco_min: 480000, registrado_em: '2027-04-01T00:00:00Z' }], 530000, AGORA)).toBeNull();
  });

  test('mudança menor que 1% não mostra', () => {
    expect(evolucaoDoPreco([{ preco_min: 500000, registrado_em: '2026-11-18T00:00:00Z' }], 503000, AGORA)).toBeNull();
  });

  test('sem preço (só parcela) ou sem histórico: nada', () => {
    expect(evolucaoDoPreco([{ preco_min: null, registrado_em: '2026-11-18T00:00:00Z' }], 500000, AGORA)).toBeNull();
    expect(evolucaoDoPreco([], 500000, AGORA)).toBeNull();
    expect(evolucaoDoPreco([{ preco_min: 1, registrado_em: '2026-11-18T00:00:00Z' }], null, AGORA)).toBeNull();
  });

  test('queda também aparece (é fato)', () => {
    expect(evolucaoDoPreco([{ preco_min: 500000, registrado_em: '2026-11-18T00:00:00Z' }], 450000, AGORA).variacao).toBe(-10);
  });
});

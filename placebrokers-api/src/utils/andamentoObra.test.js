'use strict';

const { validarAndamento } = require('./andamentoObra');

const HOJE = new Date('2026-11-18T12:00:00Z');
const validar = (dados, atual) => {
  const erros = {};
  validarAndamento(dados, erros, atual, HOJE);
  return { dados, erros };
};

describe('andamento da obra', () => {
  test('normaliza módulos, percentual com 2 casas e mês para o dia 1', () => {
    const { dados, erros } = validar({
      andamento_obra: [{ modulo: ' Módulo 01 ', percentual: '86.294' }, { modulo: 'Módulo 02', percentual: 59.91 }],
      andamento_referencia: '2026-08',
      andamento_fonte_url: ' https://aclf.com.br/belem-boulevard ',
    });
    expect(erros).toEqual({});
    expect(dados.andamento_obra).toEqual([{ modulo: 'Módulo 01', percentual: 86.29 }, { modulo: 'Módulo 02', percentual: 59.91 }]);
    expect(dados.andamento_referencia).toBe('2026-08-01');
    expect(dados.andamento_fonte_url).toBe('https://aclf.com.br/belem-boulevard');
  });

  test('percentual fora de 0–100 e módulo sem nome são recusados', () => {
    expect(validar({ andamento_obra: [{ modulo: 'A', percentual: 120 }], andamento_referencia: '2026-10' }).erros.andamentoObra).toMatch(/0 a 100/);
    expect(validar({ andamento_obra: [{ modulo: '', percentual: 10 }], andamento_referencia: '2026-10' }).erros.andamentoObra).toMatch(/nome/);
  });

  test('lista que não é lista (JSON quebrado no multipart) ou com mais de 10 módulos', () => {
    expect(validar({ andamento_obra: 'invalido' }).erros.andamentoObra).toBeDefined();
    const onze = Array.from({ length: 11 }, (_, i) => ({ modulo: `M${i}`, percentual: 1 }));
    expect(validar({ andamento_obra: onze, andamento_referencia: '2026-10' }).erros.andamentoObra).toBeDefined();
  });

  test('com módulos, o mês da medição é obrigatório; no futuro, não', () => {
    expect(validar({ andamento_obra: [{ modulo: 'A', percentual: 10 }] }).erros.andamentoReferencia).toMatch(/mês/);
    expect(validar({ andamento_referencia: '2026-12' }).erros.andamentoReferencia).toMatch(/futuro/);
  });

  test('na edição, vale o estado final (mês já salvo antes)', () => {
    const { erros } = validar({ andamento_obra: [{ modulo: 'A', percentual: 10 }] }, { andamento_referencia: '2026-10-01' });
    expect(erros).toEqual({});
  });

  test('limpar o andamento (null) vira lista vazia', () => {
    const { dados, erros } = validar({ andamento_obra: null });
    expect(erros).toEqual({});
    expect(dados.andamento_obra).toEqual([]);
  });

  test('fonte só https', () => {
    expect(validar({ andamento_fonte_url: 'http://site.com' }).erros.andamentoFonteUrl).toBeDefined();
    expect(validar({ andamento_fonte_url: 'javascript:alert(1)' }).erros.andamentoFonteUrl).toBeDefined();
  });
});

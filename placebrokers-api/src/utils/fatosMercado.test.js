'use strict';

const { validarFatos } = require('./fatosMercado');

const HOJE = new Date('2026-11-18T12:00:00Z');
const FATO = { texto: 'Porto de Galinhas recebeu 1,2 milhão de turistas em 2025.', fonte: 'Secretaria de Turismo de PE', url: 'https://www.pe.gov.br/noticia', mes: '2026-02' };
const validar = (lista) => { const dados = { fatos_mercado: lista }; const erros = {}; validarFatos(dados, erros, HOJE); return { dados, erros }; };

describe('fatos de mercado', () => {
  test('aceita fato com fonte, link https e mês', () => {
    const { dados, erros } = validar([{ ...FATO, texto: `  ${FATO.texto}  ` }]);
    expect(erros).toEqual({});
    expect(dados.fatos_mercado[0].texto).toBe(FATO.texto);
  });

  test('sem fonte ou sem link não entra', () => {
    expect(validar([{ ...FATO, fonte: '' }]).erros.fatosMercado).toMatch(/fonte/);
    expect(validar([{ ...FATO, url: 'http://site.com' }]).erros.fatosMercado).toMatch(/https/);
    expect(validar([{ ...FATO, url: 'https://instagram.com/p/x' }]).erros).toEqual({});
  });

  test('mês no futuro, texto curto demais e mais de 3 fatos são recusados', () => {
    expect(validar([{ ...FATO, mes: '2027-01' }]).erros.fatosMercado).toMatch(/futuro/);
    expect(validar([{ ...FATO, texto: 'curto' }]).erros.fatosMercado).toBeDefined();
    expect(validar([FATO, FATO, FATO, FATO]).erros.fatosMercado).toMatch(/até 3/);
  });

  test('null limpa a lista', () => {
    expect(validar(null).dados.fatos_mercado).toEqual([]);
  });
});

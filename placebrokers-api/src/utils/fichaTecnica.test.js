'use strict';

const { extrairFicha, validarFicha } = require('./fichaTecnica');

const agora = () => new Date('2026-11-18T12:00:00Z');

describe('ficha técnica e registro da incorporação', () => {
  test('aceita os campos e normaliza números vindos como texto (cadastro com arquivos)', () => {
    const dados = extrairFicha({
      torres: '2', andares: 36, aptosPorAndar: '8', unidadesTotal: 576, elevadoresPorTorre: 6, areaTerrenoM2: '12500.456',
      registroIncorporacao: '  R-5 da matrícula 12.345 ', registroCartorio: '1º Registro de Imóveis do Recife', registroData: '2026-05-12',
    });
    const erros = {};
    validarFicha(dados, erros, agora);
    expect(erros).toEqual({});
    expect(dados).toMatchObject({ torres: 2, aptos_por_andar: 8, area_terreno_m2: 12500.46, registro_incorporacao: 'R-5 da matrícula 12.345' });
  });

  test('campo vazio limpa; campo que não veio não entra', () => {
    expect(extrairFicha({ torres: '', andares: undefined })).toEqual({ torres: null });
  });

  test('recusa número fora do limite, texto curto e data no futuro', () => {
    const dados = extrairFicha({ torres: 0, andares: 2.5, elevadoresPorTorre: -1, areaTerrenoM2: 0, registroCartorio: 'x', registroData: '2027-01-01' });
    const erros = {};
    validarFicha(dados, erros, agora);
    expect(Object.keys(erros).sort()).toEqual(['andares', 'areaTerrenoM2', 'elevadoresPorTorre', 'registroCartorio', 'registroData', 'torres']);
  });

  test('data em formato errado', () => {
    const erros = {};
    validarFicha({ registro_data: '12/05/2026' }, erros, agora);
    expect(erros.registroData).toBe('Use o formato AAAA-MM-DD.');
  });
});

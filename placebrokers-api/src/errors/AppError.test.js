
'use strict';

const { AppError, STATUS_BY_CODE } = require('./AppError');

describe('AppError', () => {
  test('cria um erro de validação com status 400', () => {
    const erro = new AppError(
      'VALIDATION_ERROR',
      'Dados inválidos.'
    );

    expect(erro).toBeInstanceOf(Error);
    expect(erro.name).toBe('AppError');
    expect(erro.code).toBe('VALIDATION_ERROR');
    expect(erro.message).toBe('Dados inválidos.');
    expect(erro.statusCode).toBe(400);
  });

  test('atribui os status HTTP corretos para cada código', () => {
    expect(STATUS_BY_CODE).toEqual({
      VALIDATION_ERROR: 400,
      UNAUTHENTICATED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      SERVER_ERROR: 500,
    });
  });

  test('mantém os erros específicos dos campos', () => {
    const fieldErrors = {
      email: 'E-mail inválido.',
      nome: 'Nome obrigatório.',
    };

    const erro = new AppError(
      'VALIDATION_ERROR',
      'Verifique os campos.',
      fieldErrors
    );

    expect(erro.fieldErrors).toEqual(fieldErrors);
  });

  test('utiliza status 500 para códigos desconhecidos', () => {
    const erro = new AppError(
      'CODIGO_DESCONHECIDO',
      'Erro inesperado.'
    );

    expect(erro.statusCode).toBe(500);
  });

  test('aceita status HTTP personalizado', () => {
    const erro = new AppError(
      'CUSTOM_ERROR',
      'Erro personalizado.',
      422
    );

    expect(erro.statusCode).toBe(422);
    expect(erro.fieldErrors).toEqual({});
  });

  test('mantém compatibilidade com o formato antigo de argumentos', () => {
    const detalhes = { email: 'E-mail inválido.' };

    const erro = new AppError(
      'VALIDATION_ERROR',
      'Dados inválidos.',
      422,
      detalhes
    );

    expect(erro.statusCode).toBe(422);
    expect(erro.fieldErrors).toEqual(detalhes);
  });

  test('preserva a causa original do erro', () => {
    const causa = new Error('Falha original.');

    const erro = new AppError(
      'SERVER_ERROR',
      'Erro interno.',
      {},
      causa
    );

    expect(erro.cause).toBe(causa);
    expect(erro.statusCode).toBe(500);
  });
});

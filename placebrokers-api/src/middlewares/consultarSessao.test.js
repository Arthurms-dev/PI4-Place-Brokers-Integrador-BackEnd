'use strict';

jest.mock('../config/supabase', () => ({
  supabaseAuth: {
    auth: {
      getUser: jest.fn(),
    },
  },
}));

jest.mock('../repositories/profileRepository', () => ({
  ProfileRepository: jest.fn().mockImplementation(() => ({
    findById: jest.fn(),
  })),
}));

const { supabaseAuth } = require('../config/supabase');
const { ProfileRepository } = require('../repositories/profileRepository');
const { consultarSessao, TEMPO_CACHE_MS } = require('./consultarSessao');

const findById = ProfileRepository.mock.results[0].value.findById;

const usuario = { id: 'usuario-1' };

const perfil = {
  id: 'usuario-1',
  nome: 'Usuário de Teste',
  cargo: 'admin',
  ativo: true,
  status: 'aprovado',
};

beforeEach(() => {
  supabaseAuth.auth.getUser.mockReset();
  findById.mockReset();
});

describe('consultarSessao', () => {
  test('valida token e consulta perfil', async () => {
    supabaseAuth.auth.getUser.mockResolvedValue({
      data: { user: usuario },
      error: null,
    });

    findById.mockResolvedValue(perfil);

    const resultado = await consultarSessao('token-valido');

    expect(resultado).toEqual({
      autenticado: true,
      profile: perfil,
    });

    expect(findById).toHaveBeenCalledWith('usuario-1');
  });

  test('compartilha consultas simultâneas do mesmo token', async () => {
    supabaseAuth.auth.getUser.mockResolvedValue({
      data: { user: usuario },
      error: null,
    });

    findById.mockResolvedValue(perfil);

    const primeira = consultarSessao('token-compartilhado');
    const segunda = consultarSessao('token-compartilhado');

    expect(primeira).toBe(segunda);

    await Promise.all([primeira, segunda]);

    expect(supabaseAuth.auth.getUser).toHaveBeenCalledTimes(1);
    expect(findById).toHaveBeenCalledTimes(1);
  });

  test('não compartilha validações de tokens diferentes', async () => {
    supabaseAuth.auth.getUser.mockResolvedValue({
      data: { user: usuario },
      error: null,
    });

    findById.mockResolvedValue(perfil);

    await Promise.all([
      consultarSessao('token-a'),
      consultarSessao('token-b'),
    ]);

    expect(supabaseAuth.auth.getUser).toHaveBeenCalledTimes(2);
  });

  test('reaproveita resultado dentro da janela de cache', async () => {
    supabaseAuth.auth.getUser.mockResolvedValue({
      data: { user: usuario },
      error: null,
    });

    findById.mockResolvedValue(perfil);

    await consultarSessao('token-cache');
    await consultarSessao('token-cache');

    expect(supabaseAuth.auth.getUser).toHaveBeenCalledTimes(1);
  });

  test('revalida depois que o cache expira', async () => {
    jest.useFakeTimers();

    try {
      supabaseAuth.auth.getUser.mockResolvedValue({
        data: { user: usuario },
        error: null,
      });

      findById.mockResolvedValue(perfil);

      await consultarSessao('token-revalidar');

      jest.advanceTimersByTime(TEMPO_CACHE_MS + 1);

      await consultarSessao('token-revalidar');

      expect(supabaseAuth.auth.getUser).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  test('rejeita autenticação inválida', async () => {
    supabaseAuth.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Token inválido' },
    });

    const resultado = await consultarSessao('token-invalido');

    expect(resultado).toEqual({
      autenticado: false,
      profile: null,
    });

    expect(findById).not.toHaveBeenCalled();
  });

  test('não considera perfil inexistente como perfil autorizado', async () => {
    supabaseAuth.auth.getUser.mockResolvedValue({
      data: { user: usuario },
      error: null,
    });

    findById.mockResolvedValue(null);

    const resultado = await consultarSessao('token-sem-perfil');

    expect(resultado).toEqual({
      autenticado: true,
      profile: null,
    });
  });

  test('permite nova tentativa após falha de conexão', async () => {
    supabaseAuth.auth.getUser
      .mockRejectedValueOnce(new Error('Falha de conexão'))
      .mockResolvedValueOnce({
        data: { user: usuario },
        error: null,
      });

    findById.mockResolvedValue(perfil);

    await expect(
      consultarSessao('token-retry')
    ).rejects.toThrow('Falha de conexão');

    await expect(
      consultarSessao('token-retry')
    ).resolves.toEqual({
      autenticado: true,
      profile: perfil,
    });

    expect(supabaseAuth.auth.getUser).toHaveBeenCalledTimes(2);
  });
});
"use strict";
const { AuthService } = require('./authService');

const form = {
  nome: 'Pessoa Exemplo', email: 'pessoa@example.com', password: 'senha1234',
  confirmPassword: 'senha1234', role: 'corretor', vinculo: 'interno',
};

function dependencias(existente = null, erroAuth = null) {
  return {
    authClient: { createUser: jest.fn().mockResolvedValue({ data: null, error: erroAuth }) },
    profileRepository: {
      findByEmail: jest.fn().mockResolvedValue(existente),
      create: jest.fn(),
    },
  };
}

describe('cadastro com e-mail já existente', () => {
  test('conta recusada permanece e ADM precisa reabrir a analise', async () => {
    const deps = dependencias({ id: 'id-existente', status: 'recusado' });
    const service = new AuthService(deps);
    await expect(service.register(form)).rejects.toMatchObject({ code: 'USER_ALREADY_EXISTS', statusCode: 409 });
    expect(deps.profileRepository.findByEmail).toHaveBeenCalledWith('pessoa@example.com');
    expect(deps.authClient.createUser).not.toHaveBeenCalled();
  });

  test('trata codigo email_exists do Supabase como conflito, nao erro 500', async () => {
    const deps = dependencias(null, { code: 'email_exists', message: 'User already registered' });
    const service = new AuthService(deps);
    await expect(service.register(form)).rejects.toMatchObject({ code: 'USER_ALREADY_EXISTS', statusCode: 409 });
    expect(deps.profileRepository.create).not.toHaveBeenCalled();
  });

  test('trata texto de e-mail ja registrado do Supabase', async () => {
    const deps = dependencias(null, { message: 'A user with this email address has already been registered' });
    await expect(new AuthService(deps).register(form)).rejects.toMatchObject({ code: 'USER_ALREADY_EXISTS' });
  });

  test('nao trata falhas desconhecidas do Supabase como conta duplicada', async () => {
    const deps = dependencias(null, { code: 'unexpected_failure', message: 'Database unavailable' });
    await expect(new AuthService(deps).register(form)).rejects.toMatchObject({ code: 'SERVER_ERROR' });
  });
});

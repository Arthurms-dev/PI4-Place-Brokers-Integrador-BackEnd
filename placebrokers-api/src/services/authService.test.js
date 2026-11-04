'use strict';

const { AuthService } = require('./authService');
const { AuthError } = require('../errors/AuthError');

function createDeps(overrides = {}) {
  return {
    authClient: {
      signInWithPassword: jest.fn(),
      createUser: jest.fn(),
      ...overrides.authClient,
    },
    profileRepository: {
      findById: jest.fn(),
      create: jest.fn(),
      ...overrides.profileRepository,
    },
  };
}

describe('AuthService', () => {
  describe('validateLoginInput', () => {
    let service;

    beforeEach(() => {
      service = new AuthService(createDeps());
    });

    test('retorna erro quando o e-mail está vazio', () => {
      const errors = service.validateLoginInput({ email: '', password: '123456' });
      expect(errors.email).toBeDefined();
    });

    test('retorna erro quando o e-mail tem formato inválido', () => {
      const errors = service.validateLoginInput({ email: 'arthur@@place', password: '123456' });
      expect(errors.email).toBeDefined();
    });

    test('retorna erro quando a senha está vazia', () => {
      const errors = service.validateLoginInput({ email: 'arthur@placebrokers.com.br', password: '' });
      expect(errors.password).toBeDefined();
    });

    test('retorna erro quando a senha é muito curta', () => {
      const errors = service.validateLoginInput({ email: 'arthur@placebrokers.com.br', password: '123' });
      expect(errors.password).toBeDefined();
    });

    test('não retorna erros para dados válidos', () => {
      const errors = service.validateLoginInput({ email: 'arthur@placebrokers.com.br', password: '123456' });
      expect(errors).toEqual({});
    });
  });

  describe('login', () => {
    const validCredentials = { email: 'arthur@placebrokers.com.br', password: '123456' };
    const authUser = { id: 'auth-user-1' };
    const authSuccess = { data: { user: authUser, session: { access_token: 'fake-jwt-token' } }, error: null };
    const activeProfile = {
      id: 'auth-user-1',
      nome: 'Arthur Vinícius',
      email: 'arthur@placebrokers.com.br',
      cargo: 'admin',
      ativo: true,
    };

    test('caso de sucesso: retorna usuário e token da sessão', async () => {
      const deps = createDeps({
        authClient: { signInWithPassword: jest.fn().mockResolvedValue(authSuccess) },
        profileRepository: { findById: jest.fn().mockResolvedValue(activeProfile) },
      });
      const service = new AuthService(deps);

      const result = await service.login(validCredentials);

      expect(result.user).toEqual({
        id: 'auth-user-1',
        nome: 'Arthur Vinícius',
        email: 'arthur@placebrokers.com.br',
        role: 'admin',
        avisoLeadEmail: false,
      });
      expect(result.token).toBe('fake-jwt-token');
      expect(deps.profileRepository.findById).toHaveBeenCalledWith('auth-user-1');
    });

    test('dados inválidos: não chama o Supabase e lança AuthError de validação', async () => {
      const deps = createDeps();
      const service = new AuthService(deps);

      await expect(service.login({ email: '', password: '' })).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
      expect(deps.authClient.signInWithPassword).not.toHaveBeenCalled();
    });

    test('campos obrigatórios: indica em fieldErrors qual campo falta', async () => {
      const service = new AuthService(createDeps());

      try {
        await service.login({ email: 'arthur@placebrokers.com.br', password: '' });
        throw new Error('deveria ter lançado AuthError');
      } catch (err) {
        expect(err).toBeInstanceOf(AuthError);
        expect(err.fieldErrors.password).toBeDefined();
      }
    });

    test('e-mail ou senha incorretos: lança AuthError INVALID_CREDENTIALS', async () => {
      const deps = createDeps({
        authClient: {
          signInWithPassword: jest
            .fn()
            .mockResolvedValue({ data: { user: null, session: null }, error: { message: 'Invalid login credentials' } }),
        },
      });
      const service = new AuthService(deps);

      await expect(service.login(validCredentials)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
      expect(deps.profileRepository.findById).not.toHaveBeenCalled();
    });

    test('usuário inativo: lança AuthError USER_INACTIVE', async () => {
      const deps = createDeps({
        authClient: { signInWithPassword: jest.fn().mockResolvedValue(authSuccess) },
        profileRepository: { findById: jest.fn().mockResolvedValue({ ...activeProfile, ativo: false }) },
      });
      const service = new AuthService(deps);

      await expect(service.login(validCredentials)).rejects.toMatchObject({ code: 'USER_INACTIVE' });
    });

    test('falha ao buscar o perfil: lança AuthError SERVER_ERROR', async () => {
      const deps = createDeps({
        authClient: { signInWithPassword: jest.fn().mockResolvedValue(authSuccess) },
        profileRepository: { findById: jest.fn().mockRejectedValue(new Error('conexão recusada')) },
      });
      const service = new AuthService(deps);

      await expect(service.login(validCredentials)).rejects.toMatchObject({ code: 'SERVER_ERROR' });
    });

    test('falha de conexão com o Supabase Auth: lança AuthError SERVER_ERROR', async () => {
      const deps = createDeps({
        authClient: { signInWithPassword: jest.fn().mockRejectedValue(new Error('network error')) },
      });
      const service = new AuthService(deps);

      await expect(service.login(validCredentials)).rejects.toMatchObject({ code: 'SERVER_ERROR' });
    });

  });

  describe('register', () => {
    test.todo('caso de sucesso: cria o usuário no Supabase Auth e o perfil em profiles');
    test.todo('dados inválidos: não chama authClient nem profileRepository');
    test.todo('e-mail já cadastrado: lança AuthError USER_ALREADY_EXISTS');
    test.todo('senhas não coincidem: fieldErrors.confirmPassword é preenchido');
    test.todo('perfil inválido (fora de admin/corretor/viabilizador): fieldErrors.role é preenchido');
  });
});

describe('AuthService.renovar', () => {
  const perfil = { id: 'u1', nome: 'Ana', email: 'ana@x.com', cargo: 'corretor', ativo: true, status: 'aprovado' };
  const montar = (resultado, profile = perfil) => new AuthService({
    authClient: { signInWithPassword: jest.fn(), createUser: jest.fn(), renovarSessao: jest.fn().mockResolvedValue(resultado) },
    profileRepository: { findById: jest.fn().mockResolvedValue(profile), create: jest.fn() },
  });
  const ok = { data: { user: { id: 'u1' }, session: { access_token: 'novo', refresh_token: 'r2', expires_at: 123 } }, error: null };

  test('devolve token e refreshToken novos', async () => {
    const r = await montar(ok).renovar({ refreshToken: 'refresh-antigo' });
    expect(r.token).toBe('novo');
    expect(r.refreshToken).toBe('r2');
    expect(r.user.role).toBe('corretor');
  });

  test('refresh token inválido pede login de novo', async () => {
    let erro;
    try { await montar({ data: { session: null, user: null }, error: { message: 'Invalid Refresh Token' } }).renovar({ refreshToken: 'refresh-antigo' }); } catch (e) { erro = e; }
    expect(erro.code).toBe('INVALID_CREDENTIALS');
  });

  test('conta desativada não renova', async () => {
    let erro;
    try { await montar(ok, { ...perfil, ativo: false }).renovar({ refreshToken: 'refresh-antigo' }); } catch (e) { erro = e; }
    expect(erro.code).toBe('USER_INACTIVE');
  });
});

describe('aviso de lead por e-mail no perfil', () => {
  test('liga e desliga com verdadeiro ou falso; outro valor é recusado', async () => {
    const atualizar = jest.fn().mockImplementation(async (id, dados) => ({ id, nome: 'Bruno', email: 'b@p.com', cargo: 'corretor', ...dados }));
    const service = new AuthService({ authClient: {}, passwordClient: {}, profileRepository: { atualizar } });
    const r = await service.atualizarPerfil('c1', { avisoLeadEmail: true });
    expect(atualizar).toHaveBeenCalledWith('c1', { aviso_lead_email: true });
    expect(r.avisoLeadEmail).toBe(true);
    await expect(service.atualizarPerfil('c1', { avisoLeadEmail: 'sim' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});


'use strict';

const { AuthService } = require('./authService');
const { RedefinicaoSenhaService } = require('./redefinicaoSenhaService');

function montar(perfil) {
  const profileRepository = {
    findById: jest.fn().mockResolvedValue(perfil),
    atualizar: jest.fn().mockResolvedValue({}),
  };
  const authClient = {
    signInWithPassword: jest.fn().mockResolvedValue({
      data: { user: { id: perfil.id }, session: { access_token: 't', refresh_token: 'r', expires_at: 1 } },
      error: null,
    }),
  };
  const passwordClient = { updatePassword: jest.fn().mockResolvedValue({ error: null }) };
  return { service: new AuthService({ authClient, profileRepository, passwordClient }), profileRepository, passwordClient };
}

const temporario = { id: 'u1', nome: 'Jessica', email: 'j@place.com', cargo: 'rh', status: 'aprovado', ativo: true, trocar_senha: true };
const troca = { senhaAtual: 'temporaria1', novaSenha: 'minhaSenha2026', confirmarSenha: 'minhaSenha2026' };

describe('troca obrigatória da senha temporária (serviço)', () => {
  test('login avisa o site que precisa trocar a senha', async () => {
    const { service } = montar(temporario);
    const r = await service.login({ email: 'j@place.com', password: 'temporaria1' });
    expect(r.user.trocarSenha).toBe(true);
  });

  test('login de quem já trocou vem com trocarSenha false', async () => {
    const { service } = montar({ ...temporario, trocar_senha: false });
    const r = await service.login({ email: 'j@place.com', password: 'minhaSenha2026' });
    expect(r.user.trocarSenha).toBe(false);
  });

  test('trocar a senha libera o acesso', async () => {
    const { service, profileRepository, passwordClient } = montar(temporario);
    await expect(service.alterarSenha('u1', troca)).resolves.toEqual({ ok: true });
    expect(passwordClient.updatePassword).toHaveBeenCalledWith('u1', 'minhaSenha2026');
    expect(profileRepository.atualizar).toHaveBeenCalledWith('u1', { trocar_senha: false });
  });

  test('quem não tinha senha temporária não mexe no perfil', async () => {
    const { service, profileRepository } = montar({ ...temporario, trocar_senha: false });
    await service.alterarSenha('u1', troca);
    expect(profileRepository.atualizar).not.toHaveBeenCalled();
  });

  test('não aceita repetir a senha temporária', async () => {
    const { service, passwordClient } = montar(temporario);
    await expect(service.alterarSenha('u1', { ...troca, novaSenha: 'temporaria1', confirmarSenha: 'temporaria1' }))
      .rejects.toMatchObject({ fieldErrors: { novaSenha: expect.any(String) } });
    expect(passwordClient.updatePassword).not.toHaveBeenCalled();
  });

  test('redefinir pelo e-mail também libera', async () => {
    const profileRepository = { atualizar: jest.fn().mockResolvedValue({}) };
    const recuperacao = {
      conferirToken: jest.fn().mockResolvedValue({ id: 'u1', email: 'j@place.com', accessToken: null }),
      trocarSenha: jest.fn().mockResolvedValue(),
      encerrarSessoes: jest.fn().mockResolvedValue(),
    };
    const service = new RedefinicaoSenhaService({ profileRepository, recuperacao, email: {}, log: { error: jest.fn() } });
    const token = 'a'.repeat(56);
    await service.redefinir({ token, novaSenha: 'minhaSenha2026', confirmarSenha: 'minhaSenha2026' });
    expect(profileRepository.atualizar).toHaveBeenCalledWith('u1', { trocar_senha: false });
  });
});

'use strict';

const { createHash } = require('node:crypto');
const { senhasVazadasClient } = require('../adapters/senhasVazadasClient');
const { conferirSenhaVazada, MENSAGEM_SENHA_VAZADA } = require('./senhaVazada');
const { AuthService } = require('./authService');
const { RedefinicaoSenhaService } = require('./redefinicaoSenhaService');
const { EquipeService } = require('./equipeservice');

const sha1 = (s) => createHash('sha1').update(s).digest('hex').toUpperCase();

function respostaDaApi(senhaVazada, vezes) {
  const h = sha1(senhaVazada);
  return jest.fn(async (url) => ({
    ok: true,
    text: async () => `0000000000000000000000000000000000A:0\r\n${h.slice(5)}:${vezes}\r\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:2`,
    url,
  }));
}

describe('cliente do Pwned Passwords', () => {
  test('só manda os 5 primeiros caracteres do hash e acha a senha vazada', async () => {
    const fetchImpl = respostaDaApi('123456', 37000000);
    await expect(senhasVazadasClient.vezesQueVazou('123456', { fetchImpl })).resolves.toBe(37000000);
    const url = fetchImpl.mock.calls[0][0];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${sha1('123456').slice(0, 5)}`);
    expect(url).not.toContain('123456');
    expect(fetchImpl.mock.calls[0][1].headers['Add-Padding']).toBe('true');
  });

  test('senha que não aparece na lista volta 0', async () => {
    const fetchImpl = respostaDaApi('123456', 10);
    await expect(senhasVazadasClient.vezesQueVazou('Pl4ce-Brokers#Recife-2026!', { fetchImpl })).resolves.toBe(0);
  });

  test('erro da API vira exceção', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 503 }));
    await expect(senhasVazadasClient.vezesQueVazou('x', { fetchImpl })).rejects.toThrow('503');
  });
});

describe('conferirSenhaVazada', () => {
  test('vazada devolve a mensagem; limpa devolve null', async () => {
    await expect(conferirSenhaVazada({ vezesQueVazou: async () => 3 }, 'abc')).resolves.toBe(MENSAGEM_SENHA_VAZADA);
    await expect(conferirSenhaVazada({ vezesQueVazou: async () => 0 }, 'abc')).resolves.toBeNull();
  });

  test('se a consulta cair, não trava (só avisa no log)', async () => {
    const log = { warn: jest.fn() };
    await expect(conferirSenhaVazada({ vezesQueVazou: async () => { throw new Error('timeout'); } }, 'abc', log)).resolves.toBeNull();
    expect(log.warn).toHaveBeenCalled();
  });

  test('sem cliente configurado não confere', async () => {
    await expect(conferirSenhaVazada(null, 'abc')).resolves.toBeNull();
  });
});

const vazou = { vezesQueVazou: jest.fn(async () => 5) };

describe('senha vazada é recusada nos fluxos', () => {
  test('troca de senha', async () => {
    const passwordClient = { updatePassword: jest.fn() };
    const service = new AuthService({ authClient: {}, profileRepository: {}, passwordClient, senhasVazadas: vazou });
    await expect(service.alterarSenha('u1', { senhaAtual: 'antiga123', novaSenha: 'password123', confirmarSenha: 'password123' }))
      .rejects.toMatchObject({ fieldErrors: { novaSenha: MENSAGEM_SENHA_VAZADA } });
    expect(passwordClient.updatePassword).not.toHaveBeenCalled();
  });

  test('cadastro de corretor', async () => {
    const authClient = { createUser: jest.fn() };
    const service = new AuthService({ authClient, profileRepository: { findByEmail: jest.fn() }, passwordClient: {}, senhasVazadas: vazou });
    await expect(service.register({
      nome: 'Fulano de Tal', email: 'f@x.com', telefone: '81999998888', password: 'password123', confirmPassword: 'password123',
      role: 'corretor', vinculo: 'interno', uf: 'PE',
    })).rejects.toMatchObject({ fieldErrors: { password: MENSAGEM_SENHA_VAZADA } });
    expect(authClient.createUser).not.toHaveBeenCalled();
  });

  test('redefinição pelo e-mail não gasta o link', async () => {
    const recuperacao = { conferirToken: jest.fn(), trocarSenha: jest.fn(), encerrarSessoes: jest.fn() };
    const service = new RedefinicaoSenhaService({ profileRepository: {}, recuperacao, email: {}, senhasVazadas: vazou, log: { warn: jest.fn(), error: jest.fn() } });
    await expect(service.redefinir({ token: 'a'.repeat(56), novaSenha: 'password123', confirmarSenha: 'password123' }))
      .rejects.toMatchObject({ fieldErrors: { novaSenha: MENSAGEM_SENHA_VAZADA } });
    expect(recuperacao.conferirToken).not.toHaveBeenCalled();
  });

  test('senha temporária criada pelo admin', async () => {
    const authClient = { createUser: jest.fn() };
    const service = new EquipeService({ equipeRepository: {}, profileRepository: {}, authClient, senhasVazadas: vazou });
    await expect(service.criarUsuarioInterno({ nome: 'Jessica', email: 'j@place.com', password: 'password123', cargo: 'rh' }))
      .rejects.toMatchObject({ fieldErrors: { password: MENSAGEM_SENHA_VAZADA } });
    expect(authClient.createUser).not.toHaveBeenCalled();
  });
});

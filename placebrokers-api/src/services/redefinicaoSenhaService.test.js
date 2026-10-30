'use strict';

const { RedefinicaoSenhaService, urlDoSite, MENSAGEM_ENVIADA } = require('./redefinicaoSenhaService');
const { AuthError } = require('../errors/AuthError');
const { emailRedefinirSenha } = require('../emails/redefinirSenha');
const { criarEmailClient } = require('../adapters/emailClient');

const TOKEN = 'a'.repeat(56);
const log = { error: jest.fn(), warn: jest.fn() };

function montar({ perfil = { id: 'u1', nome: 'Maria Souza', ativo: true, status: 'aprovado' }, usuario = { id: 'u1', email: 'maria@exemplo.com', accessToken: 'jwt' } } = {}) {
  const tarefas = [];
  const deps = {
    profileRepository: { buscarParaRecuperacao: jest.fn().mockResolvedValue(perfil) },
    recuperacao: {
      gerarToken: jest.fn().mockResolvedValue(TOKEN),
      conferirToken: jest.fn().mockResolvedValue(usuario),
      trocarSenha: jest.fn().mockResolvedValue(undefined),
      encerrarSessoes: jest.fn().mockResolvedValue(undefined),
    },
    email: { enviar: jest.fn().mockResolvedValue({ enviado: true }) },
    painelAdmRepository: { criarAviso: jest.fn().mockResolvedValue({}) },
    agendar: (t) => tarefas.push(t),
    site: 'https://placebrokers.exemplo',
    log,
  };
  const service = new RedefinicaoSenhaService(deps);
  const rodarFila = async () => { for (const t of tarefas.splice(0)) await t(); };
  return { service, deps, rodarFila, tarefas };
}

async function erroDe(promessa) {
  try { await promessa; } catch (e) { return e; }
  throw new Error('era esperado um erro');
}

describe('RedefinicaoSenhaService.solicitar', () => {
  test('valida o e-mail antes de qualquer coisa', async () => {
    const { service, tarefas } = montar();
    const erro = await erroDe(service.solicitar({ email: 'nao-e-email' }));
    expect(erro).toBeInstanceOf(AuthError);
    expect(erro.fieldErrors.email).toBe('E-mail inválido.');
    expect(tarefas.length).toBe(0);
  });

  test('responde na hora com a mensagem genérica e envia em segundo plano', async () => {
    const { service, deps, rodarFila } = montar();
    const r = await service.solicitar({ email: '  Maria@Exemplo.com ' });
    expect(r).toEqual({ ok: true, message: MENSAGEM_ENVIADA });
    expect(deps.email.enviar).not.toHaveBeenCalled();

    await rodarFila();
    expect(deps.profileRepository.buscarParaRecuperacao).toHaveBeenCalledWith('maria@exemplo.com');
    expect(deps.recuperacao.gerarToken).toHaveBeenCalledWith('maria@exemplo.com');
    const enviado = deps.email.enviar.mock.calls[0][0];
    expect(enviado.para).toBe('maria@exemplo.com');
    expect(enviado.assunto).toBe('Redefinir sua senha da Place Brokers');
    expect(enviado.texto.includes(`https://placebrokers.exemplo/redefinir-senha?token=${TOKEN}`)).toBe(true);
    expect(enviado.texto.includes('Olá, Maria!')).toBe(true);
  });

  test('e-mail que não existe recebe a mesma resposta e nada é enviado', async () => {
    const { service, deps, rodarFila } = montar({ perfil: null });
    const r = await service.solicitar({ email: 'ninguem@exemplo.com' });
    expect(r.message).toBe(MENSAGEM_ENVIADA);
    await rodarFila();
    expect(deps.recuperacao.gerarToken).not.toHaveBeenCalled();
    expect(deps.email.enviar).not.toHaveBeenCalled();
  });

  test('conta desativada não recebe link', async () => {
    const { service, deps, rodarFila } = montar({ perfil: { id: 'u1', nome: 'X', ativo: false } });
    await service.solicitar({ email: 'x@exemplo.com' });
    await rodarFila();
    expect(deps.email.enviar).not.toHaveBeenCalled();
  });

  test('falha no envio só vai para o log (a resposta já saiu)', async () => {
    const { service, deps, rodarFila } = montar();
    deps.email.enviar.mockRejectedValue(new Error('Resend fora do ar'));
    service.log = { error: jest.fn() };
    await service.solicitar({ email: 'maria@exemplo.com' });
    await rodarFila();
    expect(service.log.error).toHaveBeenCalled();
  });
});

describe('RedefinicaoSenhaService.redefinir', () => {
  const dados = { token: TOKEN, novaSenha: 'senha-nova-123', confirmarSenha: 'senha-nova-123' };

  test('token com formato estranho nem chega no Supabase', async () => {
    const { service, deps } = montar();
    const erro = await erroDe(service.redefinir({ ...dados, token: 'abc' }));
    expect(erro.code).toBe('TOKEN_INVALIDO');
    expect(erro.statusCode).toBe(400);
    expect(deps.recuperacao.conferirToken).not.toHaveBeenCalled();
  });

  test('confere a senha antes de gastar o token', async () => {
    const { service, deps } = montar();
    const erro = await erroDe(service.redefinir({ ...dados, novaSenha: 'curta', confirmarSenha: 'outra' }));
    expect(erro.code).toBe('VALIDATION_ERROR');
    expect(erro.fieldErrors.novaSenha).toBeDefined();
    expect(erro.fieldErrors.confirmarSenha).toBe('As senhas não coincidem.');
    expect(deps.recuperacao.conferirToken).not.toHaveBeenCalled();
  });

  test('link vencido ou já usado', async () => {
    const { service, deps } = montar({ usuario: null });
    const erro = await erroDe(service.redefinir(dados));
    expect(erro.code).toBe('TOKEN_INVALIDO');
    expect(deps.recuperacao.trocarSenha).not.toHaveBeenCalled();
  });

  test('troca a senha, encerra as sessões antigas e avisa o admin', async () => {
    const { service, deps } = montar();
    const r = await service.redefinir(dados);
    expect(r.ok).toBe(true);
    expect(deps.recuperacao.trocarSenha).toHaveBeenCalledWith('u1', 'senha-nova-123');
    expect(deps.recuperacao.encerrarSessoes).toHaveBeenCalledWith('jwt');
    const aviso = deps.painelAdmRepository.criarAviso.mock.calls[0][0];
    expect(aviso.titulo).toBe('Senha redefinida por e-mail');
    expect(aviso.descricao.includes('maria@exemplo.com')).toBe(true);
  });

  test('erro no aviso ou ao encerrar sessões não desfaz a troca', async () => {
    const { service, deps } = montar();
    deps.recuperacao.encerrarSessoes.mockRejectedValue(new Error('x'));
    deps.painelAdmRepository.criarAviso.mockRejectedValue(new Error('y'));
    const r = await service.redefinir(dados);
    expect(r.ok).toBe(true);
  });

  test('falha ao salvar a senha vira erro de servidor', async () => {
    const { service, deps } = montar();
    deps.recuperacao.trocarSenha.mockRejectedValue(new Error('x'));
    const erro = await erroDe(service.redefinir(dados));
    expect(erro.code).toBe('SERVER_ERROR');
    expect(deps.painelAdmRepository.criarAviso).not.toHaveBeenCalled();
  });
});

describe('urlDoSite', () => {
  test('usa SITE_URL, senão o primeiro CORS_ORIGIN, sem barra no fim', () => {
    expect(urlDoSite({ SITE_URL: 'https://site.com/' })).toBe('https://site.com');
    expect(urlDoSite({ CORS_ORIGIN: 'https://a.com, https://b.com' })).toBe('https://a.com');
    expect(urlDoSite({})).toBe('http://localhost:5173');
  });
});

describe('modelo do e-mail', () => {
  test('escapa o nome no HTML', () => {
    const { html } = emailRedefinirSenha({ nome: '<script>x</script>', link: 'https://s.com/redefinir-senha?token=a' });
    expect(html.includes('<script>')).toBe(false);
    expect(html.includes('&lt;script&gt;')).toBe(true);
  });
});

describe('emailClient (Resend)', () => {
  test('sem chave em desenvolvimento mostra o link no terminal e não chama a API', async () => {
    const fetchImpl = jest.fn();
    const aviso = { warn: jest.fn(), error: jest.fn() };
    const cliente = criarEmailClient({ env: { NODE_ENV: 'development' }, fetchImpl, log: aviso });
    const r = await cliente.enviar({ para: 'a@b.com', assunto: 'x', html: '', texto: '', linkParaTeste: 'https://link' });
    expect(r.enviado).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(aviso.warn.mock.calls[0][0].includes('https://link')).toBe(true);
  });

  test('sem chave em produção nunca mostra o link', async () => {
    const aviso = { warn: jest.fn(), error: jest.fn() };
    const cliente = criarEmailClient({ env: { NODE_ENV: 'production' }, fetchImpl: jest.fn(), log: aviso });
    await cliente.enviar({ para: 'a@b.com', assunto: 'x', html: '', texto: '', linkParaTeste: 'https://link' });
    expect(aviso.warn).not.toHaveBeenCalled();
    expect(aviso.error.mock.calls[0][0].includes('https://link')).toBe(false);
  });

  test('com chave chama o Resend com o remetente configurado', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'em_1' }) });
    const cliente = criarEmailClient({ env: { RESEND_API_KEY: 're_teste', EMAIL_REMETENTE: 'Place <nao-responda@place.com>' }, fetchImpl });
    const r = await cliente.enviar({ para: 'a@b.com', assunto: 'Assunto', html: '<p>oi</p>', texto: 'oi' });
    expect(r).toEqual({ enviado: true, id: 'em_1' });
    const [url, opcoes] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(opcoes.headers.Authorization).toBe('Bearer re_teste');
    const corpo = JSON.parse(opcoes.body);
    expect(corpo.from).toBe('Place <nao-responda@place.com>');
    expect(corpo.to).toEqual(['a@b.com']);
  });

  test('resposta de erro do Resend vira exceção', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ message: 'domain not verified' }) });
    const cliente = criarEmailClient({ env: { RESEND_API_KEY: 're_teste' }, fetchImpl });
    const erro = await erroDe(cliente.enviar({ para: 'a@b.com', assunto: 'x', html: '', texto: '' }));
    expect(erro.message.includes('domain not verified')).toBe(true);
  });
});

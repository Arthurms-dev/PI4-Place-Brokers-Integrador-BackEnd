'use strict';

const { NotificacaoService } = require('./notificacaoService');

const ENV = { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VAPID_CONTATO: 'mailto:x@y.com' };
const insc = { endpoint: 'https://push.exemplo/abc', p256dh: 'k', auth: 'a' };

function setup({ env = ENV, webpush, repo = {} } = {}) {
  const wp = webpush === undefined ? { setVapidDetails: jest.fn(), sendNotification: jest.fn().mockResolvedValue({}) } : webpush;
  const r = {
    salvarInscricao: jest.fn(), removerInscricao: jest.fn(), removerPorEndpoint: jest.fn().mockResolvedValue(),
    inscricoesDe: jest.fn().mockResolvedValue([insc]), marcarEnvio: jest.fn().mockResolvedValue(),
    leadsParaAvisar: jest.fn().mockResolvedValue([]), reservarAviso: jest.fn().mockResolvedValue(true),
    ...repo,
  };
  return { wp, repo: r, service: new NotificacaoService({ repo: r, env, webpush: wp, agora: () => new Date('2026-10-29T12:00:00Z') }) };
}

describe('aviso de lead novo no celular', () => {
  test('sem chaves ou sem o pacote, fica desligado sem quebrar', async () => {
    const semChave = setup({ env: {} });
    expect(semChave.service.chavePublica()).toBe(null);
    expect(await semChave.service.avisarLeadsNovos()).toBe(0);
    const semPacote = setup({ webpush: null });
    expect(semPacote.service.chavePublica()).toBe(null);
  });

  test('valida a inscrição do navegador', async () => {
    const { service, repo } = setup();
    await expect(service.inscrever({ id: 'u1' }, { endpoint: 'http://inseguro', keys: { p256dh: 'k', auth: 'a' } })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await service.inscrever({ id: 'u1' }, { endpoint: insc.endpoint, keys: { p256dh: 'k', auth: 'a' } });
    expect(repo.salvarInscricao).toHaveBeenCalledWith('u1', insc);
  });

  test('avisa o corretor uma vez por lead e só se conseguiu reservar', async () => {
    const leads = [
      { id: 'l1', nome: 'Matheus', corretor_id: 'c1', empreendimento: { nome: 'Araçá Prime' } },
      { id: 'l2', nome: 'Já avisado', corretor_id: 'c1' },
    ];
    const { service, wp, repo } = setup({ repo: { leadsParaAvisar: jest.fn().mockResolvedValue(leads), reservarAviso: jest.fn().mockImplementation(async (id) => id === 'l1') } });
    expect(await service.avisarLeadsNovos()).toBe(1);
    expect(repo.leadsParaAvisar).toHaveBeenCalledWith('2026-10-29T11:30:00.000Z');
    expect(wp.sendNotification).toHaveBeenCalledTimes(1);
    const [destino, corpo] = wp.sendNotification.mock.calls[0];
    expect(destino).toEqual({ endpoint: insc.endpoint, keys: { p256dh: 'k', auth: 'a' } });
    expect(JSON.parse(corpo)).toMatchObject({ titulo: 'Lead novo: Matheus', url: '/corretor', tag: 'lead-l1', urgente: true });
  });

  test('aparelho que cancelou (410) sai da lista', async () => {
    const erro = Object.assign(new Error('Gone'), { statusCode: 410 });
    const { service, repo } = setup({ webpush: { setVapidDetails: jest.fn(), sendNotification: jest.fn().mockRejectedValue(erro) } });
    expect(await service.enviarParaUsuario('c1', { titulo: 'x' })).toBe(0);
    expect(repo.removerPorEndpoint).toHaveBeenCalledWith(insc.endpoint);
  });
});

describe('aviso de lead novo no app (Expo)', () => {
  const tokenExpo = 'ExponentPushToken[abcdefghij1234567890]';

  function setupExpo({ resposta, inscricoes = [{ endpoint: tokenExpo, tipo: 'expo' }] } = {}) {
    const fetchImpl = jest.fn().mockResolvedValue(resposta ?? { ok: true, json: async () => ({ data: [{ status: 'ok', id: 't1' }] }) });
    const repo = {
      salvarInscricao: jest.fn(), removerPorEndpoint: jest.fn().mockResolvedValue(), marcarEnvio: jest.fn().mockResolvedValue(),
      inscricoesDe: jest.fn().mockResolvedValue(inscricoes),
    };
    const service = new NotificacaoService({ repo, env: {}, webpush: null, fetchImpl });
    return { service, repo, fetchImpl };
  }

  test('funciona sem as chaves VAPID e não mexe no aviso do site', () => {
    const { service } = setupExpo();
    expect(service.ativo).toBe(true);
    expect(service.chavePublica()).toBe(null);
  });

  test('aceita só token do Expo válido', async () => {
    const { service, repo } = setupExpo();
    await expect(service.inscrever({ id: 'u1' }, { expoToken: 'qualquer-coisa' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await service.inscrever({ id: 'u1' }, { expoToken: tokenExpo });
    expect(repo.salvarInscricao).toHaveBeenCalledWith('u1', { endpoint: tokenExpo, tipo: 'expo' });
  });

  test('manda pelo serviço do Expo com prioridade alta', async () => {
    const { service, fetchImpl } = setupExpo();
    expect(await service.enviarParaUsuario('c1', { titulo: 'Lead novo: Ana', corpo: 'Ligue agora', url: '/corretor', tag: 'lead-1', urgente: true })).toBe(1);
    const [url, opcoes] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    const [msg] = JSON.parse(opcoes.body);
    expect(msg).toMatchObject({ to: tokenExpo, title: 'Lead novo: Ana', body: 'Ligue agora', priority: 'high', channelId: 'leads' });
  });

  test('app desinstalado sai da lista', async () => {
    const { service, repo } = setupExpo({ resposta: { ok: true, json: async () => ({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] }) } });
    expect(await service.enviarParaUsuario('c1', { titulo: 'x', corpo: 'y' })).toBe(0);
    expect(repo.removerPorEndpoint).toHaveBeenCalledWith(tokenExpo);
  });

  test('EXPO_PUSH=false desliga', () => {
    const service = new NotificacaoService({ repo: {}, env: { EXPO_PUSH: 'false' }, webpush: null, fetchImpl: jest.fn() });
    expect(service.ativo).toBe(false);
  });
});

describe('aviso de lead novo por e-mail', () => {
  const lead = (aviso) => ({ id: 'l9', nome: 'Carla Souza', corretor_id: 'c1', empreendimento: { nome: 'Mar Azul' },
    telefone: '81999998888', email: 'carla@email.com', mensagem: 'Interesse em: Mar Azul — via lista da home\nPrefere conversar com um especialista', origem: 'site',
    corretor: { nome: 'Bruno Lima', email: 'bruno@place.com', aviso_lead_email: aviso } });

  function setupEmail({ leads, enviar = jest.fn().mockResolvedValue({ enviado: true }), configurado = true } = {}) {
    const repo = {
      inscricoesDe: jest.fn().mockResolvedValue([]), marcarEnvio: jest.fn(), removerPorEndpoint: jest.fn(),
      leadsParaAvisar: jest.fn().mockResolvedValue(leads), reservarAviso: jest.fn().mockResolvedValue(true),
    };
    const emailClient = { configurado: () => configurado, enviar };
    const service = new NotificacaoService({ repo, env: { EXPO_PUSH: 'false', SITE_URL: 'https://site.teste/' }, webpush: null, emailClient, log: { error: jest.fn() }, agora: () => new Date('2026-10-29T12:00:00Z') });
    return { service, enviar };
  }

  test('manda e-mail com os dados do lead, o que fazer e o rodapé da Place', async () => {
    const { service, enviar } = setupEmail({ leads: [lead(true)] });
    expect(service.ativo).toBe(true);
    expect(await service.avisarLeadsNovos()).toBe(1);
    expect(enviar).toHaveBeenCalledTimes(1);
    const email = enviar.mock.calls[0][0];
    expect(email.para).toBe('bruno@place.com');
    expect(email.assunto).toBe('Lead novo: Carla Souza · Mar Azul');
    expect(email.texto.includes('https://site.teste/corretor/leads')).toBe(true);
    expect(email.html.includes('Olá, Bruno!')).toBe(true);
    expect(email.texto.includes('Telefone / WhatsApp: (81) 99999-8888')).toBe(true);
    expect(email.texto.includes('- Prefere conversar com um especialista')).toBe(true);
    expect(email.html.includes('https://wa.me/5581999998888')).toBe(true);
    expect(email.html.includes('CRECI 18303-J')).toBe(true);
    expect(email.texto.includes('Este é um e-mail automático')).toBe(true);
    expect(email.html.includes('https://site.teste/email/logo.png')).toBe(true);
  });

  test('quem não ligou a opção não recebe e-mail', async () => {
    const { service, enviar } = setupEmail({ leads: [lead(false)] });
    await service.avisarLeadsNovos();
    expect(enviar).not.toHaveBeenCalled();
  });

  test('falha no e-mail não trava o aviso', async () => {
    const { service } = setupEmail({ leads: [lead(true)], enviar: jest.fn().mockRejectedValue(new Error('Resend fora')) });
    expect(await service.avisarLeadsNovos()).toBe(1);
  });
});


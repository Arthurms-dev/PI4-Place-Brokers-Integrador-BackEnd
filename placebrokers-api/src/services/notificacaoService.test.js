'use strict';

jest.mock('../config/supabase', () => ({ supabaseAdmin: { from: jest.fn() } }));

const { supabaseAdmin } = require('../config/supabase');
const { NotificacaoService } = require('./notificacaoService');
const { NotificacaoRepository } = require('../repositories/notificacaoRepository');
const { LeadRepository } = require('../repositories/leadRepository');

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

  test('falha no e-mail não trava o push: se o push chegou, o lead conta como avisado', async () => {
    const { service, repo } = setup({ repo: { leadsParaAvisar: jest.fn().mockResolvedValue([lead(true)]), reservarAviso: jest.fn().mockResolvedValue('2026-10-29T12:00:00.000Z'), liberarAviso: jest.fn() } });
    service.email = { configurado: () => true, enviar: jest.fn().mockRejectedValue(new Error('Resend fora')) };
    service.emailAtivo = true;
    service.log = { error: jest.fn() };
    expect(await service.avisarLeadsNovos()).toBe(1);
    expect(repo.liberarAviso).not.toHaveBeenCalled();
  });
});

describe('aviso que não chegou volta para a fila', () => {
  const RESERVA = '2026-10-29T12:00:00.000Z';
  const leadNovo = { id: 'l5', nome: 'Paula', corretor_id: 'c1', atribuido_em: '2026-10-29T11:59:00.000Z' };

  function setupFalha({ sendNotification = jest.fn().mockRejectedValue(Object.assign(new Error('fora'), { statusCode: 503 })), inscricoes = [insc] } = {}) {
    let agora = new Date('2026-10-29T12:00:00Z').getTime();
    const repo = {
      inscricoesDe: jest.fn().mockResolvedValue(inscricoes), marcarEnvio: jest.fn().mockResolvedValue(), removerPorEndpoint: jest.fn().mockResolvedValue(),
      leadsParaAvisar: jest.fn().mockResolvedValue([leadNovo]), reservarAviso: jest.fn().mockResolvedValue(RESERVA), liberarAviso: jest.fn().mockResolvedValue(),
    };
    const log = { error: jest.fn() };
    const wp = { setVapidDetails: jest.fn(), sendNotification };
    const service = new NotificacaoService({ repo, env: { ...ENV, EXPO_PUSH: 'false' }, webpush: wp, emailClient: null, log, agora: () => new Date(agora) });
    const passar = (segundos) => { agora += segundos * 1000; };
    return { service, repo, wp, log, passar };
  }

  test('serviço de push fora: desfaz a reserva e tenta de novo depois', async () => {
    const { service, repo, wp, passar } = setupFalha();
    expect(await service.avisarLeadsNovos()).toBe(0);
    expect(repo.liberarAviso).toHaveBeenCalledWith('l5', RESERVA);

    // 30 s depois o serviço voltou: o aviso sai e a reserva fica.
    wp.sendNotification.mockResolvedValue({});
    passar(30);
    expect(await service.avisarLeadsNovos()).toBe(1);
    expect(repo.liberarAviso).toHaveBeenCalledTimes(1);
    expect(service.tentativas.size).toBe(0);
  });

  test('espera cada vez mais entre as tentativas e para no limite, deixando o erro no log', async () => {
    const { service, repo, log, passar } = setupFalha({ inscricoes: [] });
    await service.avisarLeadsNovos(); // 1ª
    passar(10);
    await service.avisarLeadsNovos(); // cedo demais: nem reserva
    expect(repo.reservarAviso).toHaveBeenCalledTimes(1);
    for (const espera of [30, 60, 120, 240, 480]) {
      passar(espera);
      await service.avisarLeadsNovos();
    }
    expect(repo.reservarAviso).toHaveBeenCalledTimes(6);
    expect(repo.liberarAviso).toHaveBeenCalledTimes(5); // a 6ª reserva fica
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('lead l5 sem aviso após 6 tentativas: corretor sem aparelho inscrito nem e-mail ligado'));
    expect(service.tentativas.size).toBe(0);
  });

  test('repasse no meio das tentativas começa a contagem do zero para o novo corretor', async () => {
    const { service, repo, wp } = setupFalha();
    await service.avisarLeadsNovos();
    repo.leadsParaAvisar.mockResolvedValue([{ ...leadNovo, corretor_id: 'c2', atribuido_em: '2026-10-29T12:00:10.000Z' }]);
    wp.sendNotification.mockResolvedValue({});
    expect(await service.avisarLeadsNovos()).toBe(1); // não espera o intervalo do corretor anterior
    expect(service.tentativas.size).toBe(0);
  });
});


// Daqui para baixo os repositórios são os de verdade, sobre tabelas em memória:
// o que se testa é o filtro de quem deve ser avisado e o repasse, não só o envio.
describe('quem é avisado: lead atribuído nos últimos 30 min', () => {
  const minutosAtras = (min) => new Date(Date.now() - min * 60 * 1000).toISOString();

  function tabelaEmMemoria(linhas) {
    const filtros = [];
    let alteracao = null;
    const filtrar = (teste) => { filtros.push(teste); return consulta; };
    const consulta = {
      select: () => consulta,
      order: () => consulta,
      limit: () => consulta,
      update: (campos) => { alteracao = campos; return consulta; },
      eq: (coluna, valor) => filtrar((l) => l[coluna] === valor),
      neq: (coluna, valor) => filtrar((l) => l[coluna] !== valor),
      is: (coluna, valor) => filtrar((l) => (l[coluna] ?? null) === valor),
      not: (coluna, operador, valor) => filtrar((l) => (l[coluna] ?? null) !== valor),
      gte: (coluna, valor) => filtrar((l) => l[coluna] >= valor),
      maybeSingle: () => consulta.then((r) => ({ data: r.data[0] ?? null, error: null })),
      then: (resolver, rejeitar) => {
        const achadas = linhas.filter((l) => filtros.every((teste) => teste(l)));
        if (alteracao) achadas.forEach((l) => Object.assign(l, alteracao));
        return Promise.resolve({ data: achadas, error: null }).then(resolver, rejeitar);
      },
    };
    return consulta;
  }

  function montar(leads) {
    const inscricoes = [
      { usuario_id: 'c1', endpoint: 'https://push.exemplo/c1', p256dh: 'k', auth: 'a', tipo: 'web' },
      { usuario_id: 'c2', endpoint: 'https://push.exemplo/c2', p256dh: 'k', auth: 'a', tipo: 'web' },
    ];
    supabaseAdmin.from.mockImplementation((tabela) => tabelaEmMemoria(tabela === 'leads' ? leads : inscricoes));
    const wp = { setVapidDetails: jest.fn(), sendNotification: jest.fn().mockResolvedValue({}) };
    const service = new NotificacaoService({ repo: new NotificacaoRepository(), env: { ...ENV, EXPO_PUSH: 'false' }, webpush: wp, emailClient: null });
    const avisos = () => wp.sendNotification.mock.calls.map(([destino, corpo]) => `${JSON.parse(corpo).tag} -> ${destino.endpoint}`);
    return { service, avisos, wp };
  }

  const lead = (id, status, extra = {}) => ({ id, nome: `Cliente ${id}`, status, corretor_id: 'c1', atribuido_em: minutosAtras(1), notificado_em: null, ...extra });

  test('convertido ou em atendimento logo após a atribuição também é avisado; perdido, antigo e sem corretor não', async () => {
    const leads = [
      lead('novo', 'novo'),
      lead('atendimento', 'em_atendimento'),
      lead('convertido', 'convertido'),
      lead('perdido', 'perdido'),
      lead('antigo', 'em_atendimento', { atribuido_em: minutosAtras(31) }),
      lead('sem-corretor', 'novo', { corretor_id: null, atribuido_em: null }),
    ];
    const { service, avisos } = montar(leads);

    expect(await service.avisarLeadsNovos()).toBe(3);
    expect(avisos().sort()).toEqual([
      'lead-atendimento -> https://push.exemplo/c1',
      'lead-convertido -> https://push.exemplo/c1',
      'lead-novo -> https://push.exemplo/c1',
    ]);
    expect(leads.filter((l) => l.notificado_em).map((l) => l.id).sort()).toEqual(['atendimento', 'convertido', 'novo']);
    // Na verificação seguinte (30 s depois) ninguém é avisado de novo.
    expect(await service.avisarLeadsNovos()).toBe(0);
  });

  test('push recusado: o lead não fica marcado como avisado no banco', async () => {
    const leads = [lead('falhou', 'novo')];
    const { service, wp } = montar(leads);
    wp.sendNotification.mockRejectedValue(Object.assign(new Error('fora'), { statusCode: 500 }));
    expect(await service.avisarLeadsNovos()).toBe(0);
    expect(leads[0].notificado_em).toBe(null);
  });

  test('repasse avisa o novo corretor, mesmo que o lead já tivesse sido avisado ao antigo', async () => {
    const leads = [lead('repassado', 'em_atendimento', { atribuido_em: minutosAtras(120), notificado_em: minutosAtras(119) })];
    const { service, avisos } = montar(leads);
    expect(await service.avisarLeadsNovos()).toBe(0);

    await new LeadRepository().atribuirCorretor('repassado', 'c2');
    expect(leads[0]).toMatchObject({ corretor_id: 'c2', notificado_em: null });

    expect(await service.avisarLeadsNovos()).toBe(1);
    expect(avisos()).toEqual(['lead-repassado -> https://push.exemplo/c2']);
    expect(await service.avisarLeadsNovos()).toBe(0);
  });
});

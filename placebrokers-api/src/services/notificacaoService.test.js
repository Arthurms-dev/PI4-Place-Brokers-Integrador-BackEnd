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

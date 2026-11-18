'use strict';

// Cliente que já tem corretor e preenche o formulário do site de novo: o corretor é avisado.
const { NotificacaoService } = require('./notificacaoService');
const { LeadService } = require('./leadService');
const { emailLeadNovo } = require('../emails/leadNovo');

const ENV = { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', EXPO_PUSH: 'false', SITE_URL: 'https://site.teste' };
const insc = { endpoint: 'https://push.exemplo/c1', p256dh: 'k', auth: 'a', tipo: 'web' };

function montar(lead, { sendNotification = jest.fn().mockResolvedValue({}), enviar = jest.fn().mockResolvedValue({ enviado: true }) } = {}) {
  const repo = {
    leadParaAviso: jest.fn().mockResolvedValue(lead),
    inscricoesDe: jest.fn().mockResolvedValue([insc]),
    marcarEnvio: jest.fn().mockResolvedValue(),
    removerPorEndpoint: jest.fn().mockResolvedValue(),
  };
  const wp = { setVapidDetails: jest.fn(), sendNotification };
  const log = { error: jest.fn() };
  const emailClient = { configurado: () => true, enviar };
  const service = new NotificacaoService({ repo, env: ENV, webpush: wp, emailClient, log });
  return { service, repo, wp, log, enviar };
}

const leadDe = (extra = {}) => ({
  id: 'l7', nome: 'Rita Alves', status: 'em_atendimento', corretor_id: 'c1', telefone: '81988887777', email: 'rita@email.com',
  empreendimento: { nome: 'Mar Azul' }, corretor: { nome: 'Bruno Lima', email: 'bruno@place.com', aviso_lead_email: true }, ...extra,
});

describe('cliente que voltou pelo site', () => {
  test('lead em atendimento: o corretor recebe push e e-mail com o aviso de retorno', async () => {
    const { service, wp, enviar } = montar(leadDe());
    expect(await service.avisarClienteVoltou('l7')).toBe(true);
    const corpo = JSON.parse(wp.sendNotification.mock.calls[0][1]);
    expect(corpo).toMatchObject({ titulo: 'Cliente voltou pelo site: Rita Alves', tag: 'lead-l7-voltou', urgente: true });
    expect(enviar.mock.calls[0][0].assunto).toBe('Cliente voltou pelo site: Rita Alves · Mar Azul');
  });

  test('lead perdido e reaberto (agora "novo") com corretor também avisa', async () => {
    const { service } = montar(leadDe({ status: 'novo' }));
    expect(await service.avisarClienteVoltou('l7')).toBe(true);
  });

  test('sem corretor ou convertido não avisa (vai para a roleta como lead novo)', async () => {
    for (const lead of [leadDe({ corretor_id: null }), leadDe({ status: 'convertido' }), null]) {
      const { service, wp, enviar } = montar(lead);
      expect(await service.avisarClienteVoltou('l7')).toBe(false);
      expect(wp.sendNotification).not.toHaveBeenCalled();
      expect(enviar).not.toHaveBeenCalled();
    }
  });

  test('nada chegou: não lança erro e registra no log', async () => {
    const { service, log } = montar(leadDe({ corretor: { aviso_lead_email: false } }), {
      sendNotification: jest.fn().mockRejectedValue(Object.assign(new Error('fora'), { statusCode: 500 })),
    });
    expect(await service.avisarClienteVoltou('l7')).toBe(false);
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('voltou pelo site'));
  });

  test('erro no banco não derruba quem chamou', async () => {
    const { service, repo, log } = montar(null);
    repo.leadParaAviso.mockRejectedValue(new Error('banco fora'));
    expect(await service.avisarClienteVoltou('l7')).toBe(false);
    expect(log.error).toHaveBeenCalled();
  });
});

describe('formulário do site chama o aviso só quando a pessoa já existia', () => {
  const dados = { nome: 'Rita', email: 'rita@email.com', telefone: '(81) 98888-7777', empreendimentoId: null, mensagem: null };
  const esperar = () => new Promise((r) => setImmediate(r));

  test('repetido: avisa em segundo plano; novo: não', async () => {
    const avisos = { avisarClienteVoltou: jest.fn().mockResolvedValue(true) };
    const leadRepository = { registrarDoSite: jest.fn().mockResolvedValue({ leadId: 'l7', repetido: true }) };
    const service = new LeadService({ leadRepository, clienteRepository: {}, avisos });

    expect(await service.criar(dados)).toEqual({ leadId: 'l7', repetido: true });
    await esperar();
    expect(avisos.avisarClienteVoltou).toHaveBeenCalledWith('l7');

    leadRepository.registrarDoSite.mockResolvedValue({ leadId: 'l8', repetido: false });
    await service.criar(dados);
    await esperar();
    expect(avisos.avisarClienteVoltou).toHaveBeenCalledTimes(1);
  });

  test('falha no aviso não muda a resposta do formulário', async () => {
    const erro = jest.spyOn(console, 'error').mockImplementation(() => {});
    const avisos = { avisarClienteVoltou: jest.fn().mockRejectedValue(new Error('x')) };
    const leadRepository = { registrarDoSite: jest.fn().mockResolvedValue({ leadId: 'l7', repetido: true }) };
    const service = new LeadService({ leadRepository, clienteRepository: {}, avisos });
    await expect(service.criar(dados)).resolves.toEqual({ leadId: 'l7', repetido: true });
    await esperar();
    expect(erro).toHaveBeenCalled();
    erro.mockRestore();
  });
});

test('e-mail de lead novo continua igual quando não é retorno', () => {
  const { assunto, texto } = emailLeadNovo({ cliente: 'Ana', link: 'https://site.teste/corretor/leads' });
  expect(assunto).toBe('Lead novo: Ana');
  expect(texto).toContain('Chegou um lead novo para você');
});

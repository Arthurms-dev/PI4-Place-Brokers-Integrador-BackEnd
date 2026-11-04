'use strict';

const { AppError } = require('../errors/AppError');

// Aviso de lead novo no celular do corretor.
// - Site (Web Push): precisa de VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_CONTATO no servidor
//   (geradas com `npx web-push generate-vapid-keys`) e do pacote web-push instalado.
// - App React Native (Expo Notifications): o app manda o token do Expo para POST /notificacoes/inscricao
//   e o back entrega pelo serviço de push do Expo. Não precisa de chave; EXPO_ACCESS_TOKEN é opcional
//   (só se o projeto do Expo exigir). EXPO_PUSH=false desliga.
// - E-mail (opcional): o corretor que ligar "Receber lead novo por e-mail" no Perfil também recebe
//   o aviso pelo Resend (RESEND_API_KEY). O link do e-mail usa SITE_URL.
// Sem nada configurado o resto do sistema funciona normalmente; só não sai notificação.

const INTERVALO_MS = 30 * 1000;
const JANELA_MIN = 30; // só avisa lead que chegou ao corretor nos últimos 30 min
const URL_EXPO = 'https://exp.host/--/api/v2/push/send';
const { emailLeadNovo } = require('../emails/leadNovo');

const TOKEN_EXPO = /^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$/;

function carregarWebPush() {
  try {
    return require('web-push');
  } catch {
    return null;
  }
}

class NotificacaoService {
  /**
   * @param {{ repo: import('../repositories/notificacaoRepository').NotificacaoRepository,
   *   env?: NodeJS.ProcessEnv, webpush?: object|null, agora?: () => Date }} deps
   */
  constructor({ repo, env = process.env, webpush, agora = () => new Date(), fetchImpl = globalThis.fetch, emailClient, log = console }) {
    this.repo = repo;
    this.log = log;
    this.email = emailClient === undefined ? require('../adapters/emailClient').criarEmailClient({ env }) : emailClient;
    this.emailAtivo = Boolean(this.email?.configurado?.());
    this.siteUrl = String(env.SITE_URL || 'http://localhost:5173').replace(/\/+$/, '');
    this.agora = agora;
    this.fetchImpl = fetchImpl;
    this.chave = env.VAPID_PUBLIC_KEY || null;
    this.webpush = webpush === undefined ? carregarWebPush() : webpush;
    this.webAtivo = Boolean(this.webpush && env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
    this.expoAtivo = env.EXPO_PUSH !== 'false' && typeof fetchImpl === 'function';
    this.expoToken = env.EXPO_ACCESS_TOKEN || null;
    this.ativo = this.webAtivo || this.expoAtivo || this.emailAtivo;
    if (this.webAtivo) {
      this.webpush.setVapidDetails(env.VAPID_CONTATO || 'mailto:contato@placebrokers.com.br', env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    }
  }

  chavePublica() {
    return this.webAtivo ? this.chave : null;
  }

  async inscrever(usuario, corpo = {}) {
    // App React Native: { expoToken: 'ExponentPushToken[...]' }
    if (corpo.expoToken !== undefined) {
      if (typeof corpo.expoToken !== 'string' || !TOKEN_EXPO.test(corpo.expoToken)) {
        throw new AppError('VALIDATION_ERROR', 'Token do Expo inválido.', 400);
      }
      await this.repo.salvarInscricao(usuario.id, { endpoint: corpo.expoToken, tipo: 'expo' });
      return { ok: true };
    }
    const endpoint = corpo.endpoint;
    const p256dh = corpo.keys?.p256dh;
    const auth = corpo.keys?.auth;
    const textoCurto = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;
    if (!textoCurto(endpoint, 1000) || !/^https:\/\//.test(endpoint) || !textoCurto(p256dh, 200) || !textoCurto(auth, 100)) {
      throw new AppError('VALIDATION_ERROR', 'Inscrição de notificação inválida.', 400);
    }
    await this.repo.salvarInscricao(usuario.id, { endpoint, p256dh, auth });
    return { ok: true };
  }

  async cancelar(usuario, endpoint) {
    if (typeof endpoint !== 'string' || !endpoint) throw new AppError('VALIDATION_ERROR', 'Informe a inscrição.', 400);
    await this.repo.removerInscricao(usuario.id, endpoint);
    return { ok: true };
  }

  /** Manda a notificação para todos os aparelhos do usuário. Devolve quantos receberam. */
  async enviarParaUsuario(usuarioId, mensagem) {
    if (!this.ativo) return 0;
    const inscricoes = await this.repo.inscricoesDe(usuarioId);
    const doApp = inscricoes.filter((i) => i.tipo === 'expo');
    let enviados = doApp.length && this.expoAtivo ? await this.enviarExpo(doApp, mensagem) : 0;
    if (!this.webAtivo) return enviados;
    for (const i of inscricoes.filter((x) => x.tipo !== 'expo')) {
      try {
        await this.webpush.sendNotification(
          { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
          JSON.stringify(mensagem),
          { TTL: 15 * 60, urgency: 'high' },
        );
        enviados += 1;
        this.repo.marcarEnvio(i.endpoint).catch(() => {});
      } catch (err) {
        // 404/410: o aparelho cancelou a inscrição; tira da lista.
        if (err?.statusCode === 404 || err?.statusCode === 410) await this.repo.removerPorEndpoint(i.endpoint).catch(() => {});
        else console.error('[push] falha ao enviar', err?.statusCode ?? err?.message);
      }
    }
    return enviados;
  }

  /** Entrega pelo serviço do Expo (app React Native). Devolve quantos aparelhos aceitaram. */
  async enviarExpo(inscricoes, mensagem) {
    const corpo = inscricoes.map((i) => ({
      to: i.endpoint,
      title: mensagem.titulo,
      body: mensagem.corpo,
      data: { url: mensagem.url, tag: mensagem.tag },
      sound: 'default',
      priority: mensagem.urgente ? 'high' : 'default',
      channelId: 'leads',
      ttl: 15 * 60,
    }));
    try {
      const resposta = await this.fetchImpl(URL_EXPO, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(this.expoToken ? { Authorization: `Bearer ${this.expoToken}` } : {}),
        },
        body: JSON.stringify(corpo),
      });
      const retorno = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        console.error('[push] Expo recusou o envio', resposta.status, retorno?.errors?.[0]?.message ?? '');
        return 0;
      }
      let enviados = 0;
      (retorno.data ?? []).forEach((ticket, n) => {
        if (ticket?.status === 'ok') {
          enviados += 1;
          this.repo.marcarEnvio(inscricoes[n].endpoint).catch(() => {});
        } else if (ticket?.details?.error === 'DeviceNotRegistered') {
          // App desinstalado ou notificação desligada: tira da lista.
          this.repo.removerPorEndpoint(inscricoes[n].endpoint).catch(() => {});
        }
      });
      return enviados;
    } catch (err) {
      console.error('[push] falha ao falar com o Expo', err?.message ?? err);
      return 0;
    }
  }

  /** Procura leads recém-entregues e avisa o corretor de cada um (uma vez por lead). */
  async avisarLeadsNovos() {
    if (!this.ativo) return 0;
    const desde = new Date(this.agora().getTime() - JANELA_MIN * 60 * 1000).toISOString();
    const leads = await this.repo.leadsParaAvisar(desde);
    let avisados = 0;
    for (const lead of leads) {
      if (!(await this.repo.reservarAviso(lead.id))) continue;
      await this.enviarEmailDoLead(lead);
      await this.enviarParaUsuario(lead.corretor_id, {
        titulo: `Lead novo: ${lead.nome}`,
        corpo: `${lead.empreendimento?.nome ? `${lead.empreendimento.nome} · ` : ''}Ligue agora: quem retorna primeiro leva o cliente.`,
        url: '/corretor',
        tag: `lead-${lead.id}`,
        urgente: true,
      });
      avisados += 1;
    }
    return avisados;
  }

  /** E-mail para o corretor que pediu esse aviso no Perfil. Falha no e-mail nunca trava o push. */
  async enviarEmailDoLead(lead) {
    const corretor = lead.corretor;
    if (!this.emailAtivo || !corretor?.aviso_lead_email || !corretor?.email) return false;
    try {
      const mensagem = emailLeadNovo({
        corretor: corretor.nome,
        cliente: lead.nome,
        empreendimento: lead.empreendimento?.nome ?? null,
        link: `${this.siteUrl}/corretor/leads`,
      });
      const r = await this.email.enviar({ para: corretor.email, ...mensagem });
      return Boolean(r?.enviado);
    } catch (err) {
      this.log.error('[e-mail] aviso de lead não enviado', err?.message ?? err);
      return false;
    }
  }

  /** Liga a verificação periódica (chamado ao subir o servidor). */
  iniciar() {
    if (!this.ativo) {
      console.log('[push] avisos de lead desligados (sem chaves VAPID e com EXPO_PUSH=false).');
      return null;
    }
    if (!this.webAtivo) console.log('[push] avisos pelo site desligados (faltam as chaves VAPID); avisos pelo app (Expo) ligados.');
    const rodar = () => this.avisarLeadsNovos().catch((err) => console.error('[push] verificação falhou', err?.message ?? err));
    rodar();
    const t = setInterval(rodar, INTERVALO_MS);
    t.unref?.();
    return t;
  }
}

let instancia = null;
function notificacoes() {
  if (!instancia) {
    const { NotificacaoRepository } = require('../repositories/notificacaoRepository');
    instancia = new NotificacaoService({ repo: new NotificacaoRepository() });
  }
  return instancia;
}

module.exports = { NotificacaoService, notificacoes };

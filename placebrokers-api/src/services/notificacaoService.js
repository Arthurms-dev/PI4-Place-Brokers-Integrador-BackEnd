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
// Aviso que não chegou por nenhum canal volta para a fila. Nova tentativa em 30 s, 1, 2, 4 e 8 min
// (cabe na janela de 30 min); depois da última o lead fica como avisado e o erro vai para o log.
const MAX_TENTATIVAS = 6;
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
    this.tentativas = new Map(); // lead|atribuição -> { feitas, proximaEm } dos avisos que não chegaram
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
    return (await this.entregarParaUsuario(usuarioId, mensagem)).enviados;
  }

  /** Igual a enviarParaUsuario, mas diz também para quantos aparelhos tentou mandar. */
  async entregarParaUsuario(usuarioId, mensagem) {
    if (!this.ativo) return { aparelhos: 0, enviados: 0 };
    const inscricoes = await this.repo.inscricoesDe(usuarioId);
    const doApp = this.expoAtivo ? inscricoes.filter((i) => i.tipo === 'expo') : [];
    const doSite = this.webAtivo ? inscricoes.filter((i) => i.tipo !== 'expo') : [];
    const aparelhos = doApp.length + doSite.length;
    let enviados = doApp.length ? await this.enviarExpo(doApp, mensagem) : 0;
    for (const i of doSite) {
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
    return { aparelhos, enviados };
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

  /**
   * Procura leads recém-entregues e avisa o corretor de cada um (uma vez por lead).
   * O lead é reservado antes do envio (dois processos não avisam em dobro), mas a reserva só fica
   * se algum canal aceitou: push num aparelho ou e-mail. Se nada chegou, ela é desfeita e o lead
   * volta na próxima verificação, até MAX_TENTATIVAS. Devolve quantos leads foram avisados.
   */
  async avisarLeadsNovos() {
    if (!this.ativo) return 0;
    const agora = this.agora().getTime();
    const desde = new Date(agora - JANELA_MIN * 60 * 1000).toISOString();
    const leads = await this.repo.leadsParaAvisar(desde);
    const { tentativas } = this;
    const vistos = new Set();
    let avisados = 0;
    for (const lead of leads) {
      // A chave inclui a atribuição: um repasse para outro corretor começa a contagem do zero.
      const chave = `${lead.id}|${lead.atribuido_em ?? ''}`;
      vistos.add(chave);
      const anterior = tentativas.get(chave);
      if (anterior && anterior.proximaEm > agora) continue;

      const reserva = await this.repo.reservarAviso(lead.id);
      if (!reserva) continue;
      const email = await this.enviarEmailDoLead(lead);
      const push = await this.entregarParaUsuario(lead.corretor_id, {
        titulo: `Lead novo: ${lead.nome}`,
        corpo: `${lead.empreendimento?.nome ? `${lead.empreendimento.nome} · ` : ''}Ligue agora: quem retorna primeiro leva o cliente.`,
        url: '/corretor',
        tag: `lead-${lead.id}`,
        urgente: true,
      });

      if (email || push.enviados > 0) {
        tentativas.delete(chave);
        avisados += 1;
        continue;
      }

      const feitas = (anterior?.feitas ?? 0) + 1;
      const motivo = push.aparelhos === 0 && !this.emailDisponivel(lead) ? 'corretor sem aparelho inscrito nem e-mail ligado' : 'nenhum canal aceitou o envio';
      if (feitas >= MAX_TENTATIVAS) {
        tentativas.delete(chave);
        this.log.error(`[aviso] lead ${lead.id} sem aviso após ${feitas} tentativas: ${motivo}`);
        continue;
      }
      // typeof: a reserva antiga (true) não tem o horário; sem ele não dá para desfazer com segurança.
      if (typeof reserva === 'string') await this.repo.liberarAviso(lead.id, reserva);
      tentativas.set(chave, { feitas, proximaEm: agora + INTERVALO_MS * 2 ** (feitas - 1) });
    }
    // Tira da memória quem saiu da janela, foi avisado em outro processo ou mudou de corretor.
    for (const chave of tentativas.keys()) if (!vistos.has(chave)) tentativas.delete(chave);
    return avisados;
  }

  /**
   * Cliente que já tinha corretor voltou pelo site (lead em atendimento, ou perdido e reaberto):
   * avisa o corretor dono do lead por push e e-mail. O relógio do atendimento (atribuido_em) não muda.
   * Lead sem corretor ou convertido não gera aviso aqui (o convertido vira lead novo e vai para a roleta).
   * Nunca lança erro: quem chama é o formulário do site, que não pode falhar por causa do aviso.
   */
  async avisarClienteVoltou(leadId) {
    if (!this.ativo || !leadId) return false;
    try {
      const lead = await this.repo.leadParaAviso(leadId);
      if (!lead?.corretor_id || lead.status === 'convertido') return false;
      const email = await this.enviarEmailDoLead(lead, { voltou: true });
      const push = await this.entregarParaUsuario(lead.corretor_id, {
        titulo: `Cliente voltou pelo site: ${lead.nome}`,
        corpo: `${lead.empreendimento?.nome ? `${lead.empreendimento.nome} · ` : ''}Ele está procurando de novo. Ligue agora.`,
        url: '/corretor',
        tag: `lead-${lead.id}-voltou`,
        urgente: true,
      });
      const chegou = email || push.enviados > 0;
      if (!chegou) this.log.error(`[aviso] lead ${lead.id} voltou pelo site, mas o aviso ao corretor não chegou por nenhum canal`);
      return chegou;
    } catch (err) {
      this.log.error('[aviso] cliente voltou pelo site: falha ao avisar', err?.message ?? err);
      return false;
    }
  }

  emailDisponivel(lead) {
    return Boolean(this.emailAtivo && lead.corretor?.aviso_lead_email && lead.corretor?.email);
  }

  /** E-mail para o corretor que pediu esse aviso no Perfil. Falha no e-mail nunca trava o push. */
  async enviarEmailDoLead(lead, { voltou = false } = {}) {
    const corretor = lead.corretor;
    if (!this.emailDisponivel(lead)) return false;
    try {
      const mensagem = emailLeadNovo({
        corretor: corretor.nome,
        cliente: lead.nome,
        empreendimento: lead.empreendimento?.nome ?? null,
        telefone: lead.telefone,
        email: lead.email,
        mensagem: lead.mensagem,
        origem: lead.origem,
        chegouEm: lead.atribuido_em,
        site: this.siteUrl,
        link: `${this.siteUrl}/corretor/leads`,
        voltou,
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

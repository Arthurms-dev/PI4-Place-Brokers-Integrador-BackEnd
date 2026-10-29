'use strict';

const { AppError } = require('../errors/AppError');

// Aviso de lead novo no celular do corretor (Web Push).
// Precisa das variáveis VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_CONTATO no servidor
// (geradas com `npx web-push generate-vapid-keys`) e do pacote web-push instalado.
// Sem elas o resto do sistema funciona normalmente; só não sai notificação.

const INTERVALO_MS = 30 * 1000;
const JANELA_MIN = 30; // só avisa lead que chegou ao corretor nos últimos 30 min

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
  constructor({ repo, env = process.env, webpush, agora = () => new Date() }) {
    this.repo = repo;
    this.agora = agora;
    this.chave = env.VAPID_PUBLIC_KEY || null;
    this.webpush = webpush === undefined ? carregarWebPush() : webpush;
    this.ativo = Boolean(this.webpush && env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
    if (this.ativo) {
      this.webpush.setVapidDetails(env.VAPID_CONTATO || 'mailto:contato@placebrokers.com.br', env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    }
  }

  chavePublica() {
    return this.ativo ? this.chave : null;
  }

  async inscrever(usuario, corpo = {}) {
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
    let enviados = 0;
    for (const i of inscricoes) {
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

  /** Procura leads recém-entregues e avisa o corretor de cada um (uma vez por lead). */
  async avisarLeadsNovos() {
    if (!this.ativo) return 0;
    const desde = new Date(this.agora().getTime() - JANELA_MIN * 60 * 1000).toISOString();
    const leads = await this.repo.leadsParaAvisar(desde);
    let avisados = 0;
    for (const lead of leads) {
      if (!(await this.repo.reservarAviso(lead.id))) continue;
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

  /** Liga a verificação periódica (chamado ao subir o servidor). */
  iniciar() {
    if (!this.ativo) {
      console.log('[push] avisos de lead desligados (falta web-push ou as chaves VAPID).');
      return null;
    }
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

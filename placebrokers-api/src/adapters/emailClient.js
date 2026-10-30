'use strict';

// Envio de e-mail pela API do Resend (https://resend.com/docs/api-reference/emails/send-email).
// Sem RESEND_API_KEY o envio é desligado: em desenvolvimento o link aparece no terminal do back
// para a equipe testar; em produção só registra o erro (nunca mostra o link).

const URL_RESEND = 'https://api.resend.com/emails';
const REMETENTE_PADRAO = 'Place Brokers <onboarding@resend.dev>';

/**
 * @param {{ env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch, log?: Console }} [opcoes]
 */
function criarEmailClient({ env = process.env, fetchImpl = globalThis.fetch, log = console } = {}) {
  return {
    configurado: () => Boolean(env.RESEND_API_KEY),

    /**
     * @param {{ para: string, assunto: string, html: string, texto: string, linkParaTeste?: string }} email
     * @returns {Promise<{ enviado: boolean, id?: string }>}
     */
    async enviar({ para, assunto, html, texto, linkParaTeste }) {
      if (!env.RESEND_API_KEY) {
        if (env.NODE_ENV === 'production') {
          log.error('E-mail não enviado: RESEND_API_KEY não está configurada no ambiente.');
        } else {
          log.warn(`[e-mail desligado] "${assunto}" para ${para}.${linkParaTeste ? ` Link para teste: ${linkParaTeste}` : ''}`);
        }
        return { enviado: false };
      }

      const resposta = await fetchImpl(URL_RESEND, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: env.EMAIL_REMETENTE || REMETENTE_PADRAO,
          to: [para],
          subject: assunto,
          html,
          text: texto,
        }),
      });

      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        throw new Error(`Resend recusou o e-mail (${resposta.status}): ${corpo?.message ?? 'sem detalhes'}`);
      }
      return { enviado: true, id: corpo?.id };
    },
  };
}

module.exports = { criarEmailClient, emailClient: criarEmailClient(), URL_RESEND, REMETENTE_PADRAO };

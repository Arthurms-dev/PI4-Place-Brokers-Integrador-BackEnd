'use strict';

// Modelo do e-mail "Lead novo" para o corretor. Sem dados de contato do cliente no e-mail
// (telefone e e-mail ficam só no sistema, atrás do login), por segurança e LGPD.

const { escapar } = require('./redefinirSenha');

/**
 * @param {{ corretor?: string, cliente: string, empreendimento?: string|null, link: string }} dados
 * @returns {{ assunto: string, html: string, texto: string }}
 */
function emailLeadNovo({ corretor, cliente, empreendimento, link }) {
  const primeiroNome = String(corretor ?? '').trim().split(/\s+/)[0] || '';
  const saudacao = primeiroNome ? `Olá, ${primeiroNome}!` : 'Olá!';
  const nomeCliente = String(cliente ?? '').trim() || 'Cliente sem nome';
  const sobre = empreendimento ? ` interessado(a) em ${empreendimento}` : '';

  const assunto = `Lead novo: ${nomeCliente}${empreendimento ? ` · ${empreendimento}` : ''}`;

  const texto = [
    saudacao,
    '',
    `Chegou um lead novo para você: ${nomeCliente}${sobre}.`,
    'Quem retorna primeiro leva o cliente. Abra o sistema para ver o telefone e falar agora:',
    '',
    link,
    '',
    'Este aviso é automático para os corretores da Place Brokers.',
    '',
    'Place Brokers',
  ].join('\n');

  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:24px;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif;color:#1d1d1f">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px">
    <tr><td style="padding:28px 28px 8px">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#a8862f">Place Brokers</p>
      <h1 style="margin:0 0 16px;font-size:20px">${escapar(saudacao)}</h1>
      <p style="margin:0 0 8px;font-size:15px;line-height:1.5">Chegou um lead novo para você:</p>
      <p style="margin:0 0 20px;font-size:18px;font-weight:bold">${escapar(nomeCliente)}</p>
      ${empreendimento ? `<p style="margin:-12px 0 20px;font-size:14px;color:#55555a">Interesse: ${escapar(empreendimento)}</p>` : ''}
      <p style="margin:0 0 20px;font-size:15px;line-height:1.5">Quem retorna primeiro leva o cliente. Abra o sistema para ver o telefone e falar agora.</p>
      <p style="margin:0 0 24px"><a href="${escapar(link)}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#c9a54c;color:#1d1d1f;font-weight:bold;text-decoration:none">Ver o lead</a></p>
      <p style="margin:0 0 24px;font-size:12px;line-height:1.5;color:#8a8a8f">Este aviso é automático para os corretores da Place Brokers.</p>
    </td></tr>
  </table>
</body>
</html>`;

  return { assunto, html, texto };
}

module.exports = { emailLeadNovo };

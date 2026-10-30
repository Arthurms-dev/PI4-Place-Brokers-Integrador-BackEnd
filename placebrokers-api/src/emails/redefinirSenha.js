'use strict';

// Modelo do e-mail "Redefinir senha". Texto e HTML simples (sem imagens externas)
// para não cair no spam e abrir bem em qualquer cliente de e-mail.

const escapar = (s = '') => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * @param {{ nome?: string, link: string, validadeMinutos?: number }} dados
 * @returns {{ assunto: string, html: string, texto: string }}
 */
function emailRedefinirSenha({ nome, link, validadeMinutos = 60 }) {
  const primeiroNome = String(nome ?? '').trim().split(/\s+/)[0] || '';
  const saudacao = primeiroNome ? `Olá, ${primeiroNome}!` : 'Olá!';
  const validade = validadeMinutos >= 60 && validadeMinutos % 60 === 0
    ? `${validadeMinutos / 60} hora${validadeMinutos === 60 ? '' : 's'}`
    : `${validadeMinutos} minutos`;

  const assunto = 'Redefinir sua senha da Place Brokers';

  const texto = [
    saudacao,
    '',
    'Recebemos um pedido para redefinir a senha da sua conta na Place Brokers.',
    'Para criar uma senha nova, abra o link abaixo:',
    '',
    link,
    '',
    `O link vale por ${validade} e só pode ser usado uma vez.`,
    'Se não foi você que pediu, ignore este e-mail: sua senha continua a mesma.',
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
      <p style="margin:0 0 20px;font-size:15px;line-height:1.5">Recebemos um pedido para redefinir a senha da sua conta. Toque no botão para criar uma senha nova.</p>
      <p style="margin:0 0 24px"><a href="${escapar(link)}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#c9a54c;color:#1d1d1f;font-weight:bold;text-decoration:none">Criar nova senha</a></p>
      <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#55555a">O link vale por ${escapar(validade)} e só pode ser usado uma vez.</p>
      <p style="margin:0 0 20px;font-size:13px;line-height:1.5;color:#55555a">Se não foi você que pediu, ignore este e-mail: sua senha continua a mesma.</p>
      <p style="margin:0 0 24px;font-size:12px;line-height:1.5;color:#8a8a8f;word-break:break-all">Se o botão não abrir, copie este endereço no navegador:<br>${escapar(link)}</p>
    </td></tr>
  </table>
</body>
</html>`;

  return { assunto, html, texto };
}

module.exports = { emailRedefinirSenha, escapar };

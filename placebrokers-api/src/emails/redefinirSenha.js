'use strict';

// E-mail "Redefinir senha": explica o que aconteceu, o passo a passo e o que fazer se não foi a pessoa.

const { moldura, rodapeTexto, botao, paragrafo, escapar } = require('./layout');

/**
 * @param {{ nome?: string, link: string, validadeMinutos?: number, site?: string }} dados
 * @returns {{ assunto: string, html: string, texto: string }}
 */
function emailRedefinirSenha({ nome, link, validadeMinutos = 60, site }) {
  const base = site || new URL(link).origin;
  const primeiroNome = String(nome ?? '').trim().split(/\s+/)[0] || '';
  const saudacao = primeiroNome ? `Olá, ${primeiroNome}!` : 'Olá!';
  const validade = validadeMinutos >= 60 && validadeMinutos % 60 === 0
    ? `${validadeMinutos / 60} hora${validadeMinutos === 60 ? '' : 's'}`
    : `${validadeMinutos} minutos`;

  const assunto = 'Redefinir sua senha da Place Brokers';

  const texto = [
    saudacao,
    '',
    'Recebemos um pedido para criar uma senha nova na sua conta da Place Brokers.',
    '',
    'Como fazer:',
    '1. Abra o link abaixo (de preferência no mesmo aparelho em que você usa o sistema).',
    '2. Digite a senha nova duas vezes. Use pelo menos 8 caracteres; misturar letras, números e símbolos deixa mais segura.',
    '3. Clique em "Salvar nova senha" e entre com ela no login.',
    '',
    link,
    '',
    `O link vale por ${validade} e só funciona uma vez. Se passar do prazo, peça outro em "Esqueci minha senha".`,
    'Por segurança, depois da troca as outras sessões abertas da sua conta são encerradas.',
    '',
    'Não pediu? Pode ignorar este e-mail: sua senha continua a mesma e ninguém consegue trocar sem este link.',
    'Se receber vários e-mails assim sem ter pedido, avise o seu gerente.',
    '',
    rodapeTexto(),
  ].join('\n');

  const conteudoHtml = `
          <h1 style="margin:0 0 14px;font-size:22px;color:#0b203b">${escapar(saudacao)}</h1>
          ${paragrafo('Recebemos um pedido para criar uma <b>senha nova</b> na sua conta da Place Brokers. É rápido:')}
          <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 20px">
            <tr><td style="padding:0 10px 10px 0;vertical-align:top"><span style="display:inline-block;width:26px;height:26px;line-height:26px;text-align:center;border-radius:50%;background:#fff3e0;color:#986827;font-weight:bold;font-size:13px">1</span></td><td style="padding:3px 0 10px;font-size:14px;line-height:1.5">Toque no botão abaixo (de preferência no aparelho em que você usa o sistema).</td></tr>
            <tr><td style="padding:0 10px 10px 0;vertical-align:top"><span style="display:inline-block;width:26px;height:26px;line-height:26px;text-align:center;border-radius:50%;background:#fff3e0;color:#986827;font-weight:bold;font-size:13px">2</span></td><td style="padding:3px 0 10px;font-size:14px;line-height:1.5">Digite a senha nova duas vezes. Use pelo menos 8 caracteres; letras, números e símbolos deixam mais segura.</td></tr>
            <tr><td style="padding:0 10px 0 0;vertical-align:top"><span style="display:inline-block;width:26px;height:26px;line-height:26px;text-align:center;border-radius:50%;background:#fff3e0;color:#986827;font-weight:bold;font-size:13px">3</span></td><td style="padding:3px 0 0;font-size:14px;line-height:1.5">Clique em <b>Salvar nova senha</b> e entre com ela no login.</td></tr>
          </table>
          ${botao(link, 'Criar nova senha')}
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 18px;background:#fff8ee;border:1px solid #f1dcb8;border-radius:10px">
            <tr><td style="padding:14px 16px;font-size:13px;line-height:1.55;color:#5b4520">
              <b>Importante:</b> o link vale por ${escapar(validade)} e só funciona uma vez. Se passar do prazo, peça outro em "Esqueci minha senha". Depois da troca, as outras sessões abertas da sua conta são encerradas.
            </td></tr>
          </table>
          ${paragrafo('<b>Não pediu?</b> Pode ignorar este e-mail: sua senha continua a mesma e ninguém consegue trocá-la sem este link. Se receber vários e-mails assim sem ter pedido, avise o seu gerente.', 'font-size:13px;color:#516783')}
          <p style="margin:0 0 20px;font-size:12px;line-height:1.5;color:#7a8ca1;word-break:break-all">Se o botão não abrir, copie este endereço no navegador:<br>${escapar(link)}</p>`;

  return { assunto, html: moldura({ site: base, preheader: `Crie uma senha nova em 3 passos. O link vale por ${validade}.`, conteudoHtml }), texto };
}

module.exports = { emailRedefinirSenha, escapar };

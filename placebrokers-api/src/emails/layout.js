'use strict';

// Moldura comum de todos os e-mails da Place Brokers: cabeçalho com a logo, conteúdo e
// rodapé fixo (CRECI, endereço e aviso de e-mail automático). HTML simples, em tabelas e com
// estilos inline, para abrir bem no Gmail, Outlook e celular. As imagens ficam no próprio site
// (SITE_URL/email/...), em PNG/JPG, porque vários leitores de e-mail não abrem WebP.

const escapar = (s = '') => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const EMPRESA = {
  nome: 'Place Brokers Negócios Imobiliários',
  creci: 'CRECI 18303-J',
  endereco: 'R. Bruno Veloso, 333A, Boa Viagem, Recife/PE, 51021-280',
  suporte: 'suporte@placebrokers.com.br',
  instagram: 'https://www.instagram.com/placebrokers.imobiliaria/',
};

const AVISO_AUTOMATICO = 'Este é um e-mail automático, por favor não responda. Dúvidas: fale com o seu gerente ou escreva para';

const semBarra = (url = '') => String(url).replace(/\/+$/, '');

/** Rodapé em texto puro (vai em todo e-mail, para quem lê sem HTML). */
function rodapeTexto() {
  return [
    '—',
    `${EMPRESA.nome} · ${EMPRESA.creci}`,
    EMPRESA.endereco,
    `${AVISO_AUTOMATICO} ${EMPRESA.suporte}.`,
  ].join('\n');
}

/**
 * @param {{ site: string, preheader?: string, conteudoHtml: string }} dados
 * @returns {string} documento HTML completo
 */
function moldura({ site, preheader = '', conteudoHtml }) {
  const base = semBarra(site);
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#0b203b">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapar(preheader)}</span>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f7;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">
        <tr><td style="background:#08152b;padding:22px 28px">
          <img src="${escapar(base)}/email/logo.png" width="150" alt="Place Brokers" style="display:block;border:0;height:auto;width:150px">
        </td></tr>
        <tr><td style="padding:28px 28px 8px">
${conteudoHtml}
        </td></tr>
        <tr><td style="padding:20px 28px 26px;background:#f7f9fc;border-top:1px solid #e3e9f1">
          <p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:#516783"><b style="color:#0b203b">${escapar(EMPRESA.nome)}</b> · ${escapar(EMPRESA.creci)}</p>
          <p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:#516783">${escapar(EMPRESA.endereco)}</p>
          <p style="margin:0 0 10px;font-size:12px;line-height:1.5;color:#516783">${escapar(AVISO_AUTOMATICO)} <a href="mailto:${EMPRESA.suporte}" style="color:#986827">${EMPRESA.suporte}</a>.</p>
          <p style="margin:0;font-size:12px"><a href="${escapar(base)}" style="color:#986827;text-decoration:none">Site</a> &nbsp;·&nbsp; <a href="${EMPRESA.instagram}" style="color:#986827;text-decoration:none">Instagram @placebrokers.imobiliaria</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Botão dourado (o link também vai escrito embaixo, caso o botão não abra). */
const botao = (link, texto) => `<p style="margin:0 0 22px"><a href="${escapar(link)}" style="display:inline-block;padding:13px 24px;border-radius:999px;background:#e9ad5a;color:#08152b;font-weight:bold;font-size:15px;text-decoration:none">${escapar(texto)}</a></p>`;

const paragrafo = (html, extra = '') => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#0b203b;${extra}">${html}</p>`;

module.exports = { moldura, rodapeTexto, botao, paragrafo, escapar, semBarra, EMPRESA };

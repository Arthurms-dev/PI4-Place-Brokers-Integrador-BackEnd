'use strict';

// E-mail "Lead novo" para o corretor: quem é o cliente, o que ele quer, como falar com ele e o que
// fazer agora. Vai só para o corretor que recebeu o lead (dono do atendimento).

const { moldura, rodapeTexto, botao, paragrafo, escapar } = require('./layout');

const soDigitos = (s = '') => String(s).replace(/\D/g, '');

function formatarTelefone(tel) {
  const d = soDigitos(tel);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(tel ?? '');
}

const ORIGENS = { site: 'Site da Place', roleta: 'Roleta do dia', indicacao: 'Indicação', manual: 'Cadastro manual' };

function quando(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Recife', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return '';
  }
}

/**
 * @param {{ corretor?: string, cliente: string, empreendimento?: string|null, link: string, site?: string,
 *   telefone?: string|null, email?: string|null, mensagem?: string|null, origem?: string|null, chegouEm?: string|null }} dados
 * @returns {{ assunto: string, html: string, texto: string }}
 */
function emailLeadNovo({ corretor, cliente, empreendimento, link, site, telefone, email, mensagem, origem, chegouEm }) {
  const base = site || new URL(link).origin;
  const primeiroNome = String(corretor ?? '').trim().split(/\s+/)[0] || '';
  const saudacao = primeiroNome ? `Olá, ${primeiroNome}!` : 'Olá!';
  const nomeCliente = String(cliente ?? '').trim() || 'Cliente sem nome';
  const tel = telefone ? formatarTelefone(telefone) : '';
  const zap = soDigitos(telefone).length >= 10 ? `https://wa.me/55${soDigitos(telefone)}` : '';
  const linhasMensagem = String(mensagem ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const hora = quando(chegouEm);
  const fonte = ORIGENS[origem] ?? origem ?? '';

  const assunto = `Lead novo: ${nomeCliente}${empreendimento ? ` · ${empreendimento}` : ''}`;

  const ficha = [
    ['Cliente', nomeCliente],
    ['Imóvel de interesse', empreendimento || 'Ainda não escolheu'],
    tel && ['Telefone / WhatsApp', tel],
    email && ['E-mail', email],
    fonte && ['Origem', fonte],
    hora && ['Chegou em', hora],
  ].filter(Boolean);

  const texto = [
    saudacao,
    '',
    'Chegou um lead novo para você na Place Brokers.',
    '',
    ...ficha.map(([k, v]) => `${k}: ${v}`),
    ...(linhasMensagem.length ? ['', 'O que o cliente escreveu:', ...linhasMensagem.map((l) => `- ${l}`)] : []),
    '',
    'O que fazer agora:',
    '1. Ligue ou chame no WhatsApp o quanto antes: quem retorna primeiro leva o cliente.',
    '2. No sistema, abra o lead e registre o contato (ligar ou WhatsApp pelo sistema já registra sozinho).',
    '3. Se combinar visita, marque na Agenda para receber o lembrete.',
    '',
    `Abrir meus leads: ${link}`,
    '',
    'Os dados do cliente são para o atendimento dele: não repasse a terceiros (LGPD).',
    '',
    rodapeTexto(),
  ].join('\n');

  const linhaFicha = ([k, v], i) => `<tr><td style="padding:9px 14px;font-size:12px;color:#516783;width:42%;${i ? 'border-top:1px solid #e3e9f1;' : ''}">${escapar(k)}</td><td style="padding:9px 14px;font-size:14px;font-weight:bold;color:#0b203b;${i ? 'border-top:1px solid #e3e9f1;' : ''}">${escapar(v)}</td></tr>`;

  const conteudoHtml = `
          <p style="margin:0 0 6px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#986827;font-weight:bold">Lead novo</p>
          <h1 style="margin:0 0 14px;font-size:22px;color:#0b203b">${escapar(saudacao)}</h1>
          ${paragrafo('Chegou um lead novo para você. <b>Quem retorna primeiro leva o cliente</b>, então vale ligar agora.')}
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 18px;border:1px solid #e3e9f1;border-radius:10px">
            ${ficha.map(linhaFicha).join('\n            ')}
          </table>
          ${linhasMensagem.length ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 18px;background:#fff8ee;border:1px solid #f1dcb8;border-radius:10px">
            <tr><td style="padding:14px 16px;font-size:13px;line-height:1.6;color:#5b4520">
              <b>O que o cliente escreveu:</b><br>${linhasMensagem.map(escapar).join('<br>')}
            </td></tr>
          </table>` : ''}
          ${zap ? `<p style="margin:0 0 12px"><a href="${escapar(zap)}" style="display:inline-block;padding:13px 24px;border-radius:999px;background:#25d366;color:#06210f;font-weight:bold;font-size:15px;text-decoration:none">Chamar no WhatsApp</a></p>` : ''}
          ${botao(link, 'Abrir meus leads')}
          <p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:#0b203b">O que fazer agora</p>
          <ol style="margin:0 0 18px;padding-left:20px;font-size:14px;line-height:1.6;color:#0b203b">
            <li>Ligue ou chame no WhatsApp o quanto antes.</li>
            <li>No sistema, abra o lead e registre o contato (ligar ou chamar pelo sistema já registra sozinho).</li>
            <li>Se combinar visita, marque na Agenda para receber o lembrete.</li>
          </ol>
          ${paragrafo('Os dados do cliente são para o atendimento dele: não repasse a terceiros (LGPD).', 'font-size:12px;color:#7a8ca1')}`;

  return { assunto, html: moldura({ site: base, preheader: `${nomeCliente}${empreendimento ? ` quer saber do ${empreendimento}` : ' quer falar com você'}. Ligue agora.`, conteudoHtml }), texto };
}

module.exports = { emailLeadNovo, formatarTelefone };

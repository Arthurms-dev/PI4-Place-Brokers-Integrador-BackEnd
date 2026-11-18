'use strict';

// Confere se uma senha já apareceu em vazamentos de dados (HaveIBeenPwned, Pwned Passwords).
// k-anonimato: só os 5 primeiros caracteres do SHA-1 saem daqui; a senha e o hash completo nunca saem.
// A API é gratuita e não precisa de chave. "Add-Padding" deixa todas as respostas do mesmo tamanho.

const { createHash } = require('node:crypto');

const URL_BASE = 'https://api.pwnedpasswords.com/range/';
const TEMPO_LIMITE_MS = 3000;

/**
 * @param {string} senha
 * @param {{ fetchImpl?: typeof fetch, tempoLimiteMs?: number }} [opcoes]
 * @returns {Promise<number>} quantas vezes a senha apareceu em vazamentos (0 = nunca)
 */
async function vezesQueVazou(senha, { fetchImpl = fetch, tempoLimiteMs = TEMPO_LIMITE_MS } = {}) {
  const hash = createHash('sha1').update(String(senha), 'utf8').digest('hex').toUpperCase();
  const prefixo = hash.slice(0, 5);
  const sufixo = hash.slice(5);

  const resposta = await fetchImpl(`${URL_BASE}${prefixo}`, {
    headers: { 'Add-Padding': 'true', 'User-Agent': 'placebrokers-api' },
    signal: AbortSignal.timeout(tempoLimiteMs),
  });
  if (!resposta.ok) throw new Error(`Pwned Passwords respondeu ${resposta.status}.`);

  const texto = await resposta.text();
  for (const linha of texto.split('\n')) {
    const [parte, vezes] = linha.trim().split(':');
    if (parte === sufixo) return Number(vezes) || 0;
  }
  return 0;
}

module.exports = { senhasVazadasClient: { vezesQueVazou } };

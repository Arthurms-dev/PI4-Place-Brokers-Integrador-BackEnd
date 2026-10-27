'use strict';

// DDDs em uso no Brasil (Anatel).
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
].map(String));

/**
 * Ajusta o telefone para um formato único (DDD + número, só dígitos), para que o
 * mesmo contato digitado de jeitos diferentes seja reconhecido como a mesma pessoa.
 *
 * - tira máscara, +55 e o zero de operadora/interurbano (0 81 ..., 0xx81 ...);
 * - celular antigo de 8 dígitos (começa com 6-9) ganha o 9 na frente;
 * - recusa DDD que não existe, celular sem o 9 e números repetidos (99999-9999).
 *
 * @param {string|null|undefined} valor
 * @returns {{ ok: true, digitos: string } | { ok: false, erro: string }}
 */
function normalizarTelefone(valor) {
  let d = String(valor ?? '').replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if ((d.length === 13 || d.length === 14) && d.startsWith('0')) d = d.slice(3); // 0 + operadora + DDD + número
  if ((d.length === 11 || d.length === 12) && d.startsWith('0')) d = d.slice(1);

  if (d.length !== 10 && d.length !== 11) return { ok: false, erro: 'Informe o telefone com DDD.' };

  const ddd = d.slice(0, 2);
  let numero = d.slice(2);
  if (!DDDS.has(ddd)) return { ok: false, erro: 'DDD inválido.' };

  if (numero.length === 8 && /^[6-9]/.test(numero)) numero = `9${numero}`;
  if (numero.length === 9 && numero[0] !== '9') return { ok: false, erro: 'Celular deve começar com 9.' };
  if (numero.length === 8 && !/^[2-5]/.test(numero)) return { ok: false, erro: 'Telefone inválido.' };
  if (/^(\d)\1+$/.test(numero.slice(1))) return { ok: false, erro: 'Telefone inválido.' };

  return { ok: true, digitos: ddd + numero };
}

module.exports = { normalizarTelefone };

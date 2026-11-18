'use strict';

// Evolução do preço "a partir de" desde a primeira foto guardada.
// Só aparece com histórico de pelo menos 90 dias e mudança de 1% ou mais (antes disso é ruído).
const DIAS_MINIMOS = 90;
const VARIACAO_MINIMA = 1;

/**
 * @param {{ preco_min: number|string|null, registrado_em: string }[]} historico do mais antigo ao mais novo
 * @param {number|string|null} precoAtual
 * @returns {{ de: number, para: number, desde: string, variacao: number } | null}
 */
function evolucaoDoPreco(historico, precoAtual, agora = Date.now()) {
  const para = Number(precoAtual);
  if (!Number.isFinite(para) || para <= 0) return null;
  const primeiro = (historico ?? []).find((h) => Number(h.preco_min) > 0);
  if (!primeiro) return null;
  const de = Number(primeiro.preco_min);
  const dias = (agora - Date.parse(primeiro.registrado_em)) / 86_400_000;
  const variacao = Math.round(((para - de) / de) * 1000) / 10;
  if (dias < DIAS_MINIMOS || Math.abs(variacao) < VARIACAO_MINIMA) return null;
  return { de, para, desde: primeiro.registrado_em.slice(0, 10), variacao };
}

module.exports = { evolucaoDoPreco, DIAS_MINIMOS, VARIACAO_MINIMA };

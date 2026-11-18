'use strict';

// Fatos de mercado (até 3 por empreendimento): só o que foi publicado por alguém, com link para conferir.
const LIMITE_FATOS = 3;

/**
 * Valida e normaliza `dados.fatos_mercado` (altera o objeto) e preenche `erros.fatosMercado`.
 * @param {object} dados
 * @param {object} erros
 * @param {Date} [hoje]
 */
function validarFatos(dados, erros, hoje = new Date()) {
  if (!('fatos_mercado' in dados)) return;
  const lista = dados.fatos_mercado ?? [];
  if (!Array.isArray(lista) || lista.length > LIMITE_FATOS) {
    erros.fatosMercado = `Informe até ${LIMITE_FATOS} fatos.`;
    return;
  }
  const mesAtual = hoje.toISOString().slice(0, 7);
  const normal = [];
  for (const f of lista) {
    const texto = String(f?.texto ?? '').replace(/\s+/g, ' ').trim();
    const fonte = String(f?.fonte ?? '').trim();
    const url = String(f?.url ?? '').trim();
    const mes = String(f?.mes ?? '').slice(0, 7);
    if (texto.length < 10 || texto.length > 200) { erros.fatosMercado = 'Cada fato precisa de 10 a 200 letras.'; return; }
    if (fonte.length < 2 || fonte.length > 80) { erros.fatosMercado = 'Informe quem publicou (a fonte).'; return; }
    if (!/^https:\/\/\S+$/.test(url) || url.length > 500) { erros.fatosMercado = 'Cada fato precisa do link https da fonte.'; return; }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes) || mes > mesAtual) { erros.fatosMercado = 'Informe o mês da publicação (não pode ser no futuro).'; return; }
    normal.push({ texto, fonte, url, mes });
  }
  dados.fatos_mercado = normal;
}

module.exports = { validarFatos, LIMITE_FATOS };

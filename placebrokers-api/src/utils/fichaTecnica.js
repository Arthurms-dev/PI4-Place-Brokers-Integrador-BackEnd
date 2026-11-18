'use strict';

// Ficha técnica e registro da incorporação: nome do campo na API -> coluna no banco.
const CAMPOS_FICHA = {
  torres: 'torres',
  andares: 'andares',
  aptosPorAndar: 'aptos_por_andar',
  unidadesTotal: 'unidades_total',
  elevadoresPorTorre: 'elevadores_por_torre',
  areaTerrenoM2: 'area_terreno_m2',
  registroIncorporacao: 'registro_incorporacao',
  registroCartorio: 'registro_cartorio',
  registroData: 'registro_data',
};

// Inteiros com mínimo e máximo (os mesmos limites do banco).
const INTEIROS = {
  torres: [1, 100],
  andares: [1, 200],
  aptos_por_andar: [1, 100],
  unidades_total: [1, 50000],
  elevadores_por_torre: [0, 50],
};
const TEXTOS = ['registro_incorporacao', 'registro_cartorio'];

/** Lê os campos da ficha (nomes da API) e devolve só os que vieram, já com o nome da coluna. */
function extrairFicha(entrada = {}) {
  const dados = {};
  for (const [campo, coluna] of Object.entries(CAMPOS_FICHA)) {
    if (entrada[campo] !== undefined) dados[coluna] = entrada[campo] === '' ? null : entrada[campo];
  }
  return dados;
}

/**
 * Valida e normaliza (altera `dados`, com nomes de coluna) e preenche `erros` com nomes da API.
 * @param {object} dados @param {object} erros @param {() => Date} [agora]
 */
function validarFicha(dados, erros, agora = () => new Date()) {
  const campoDaApi = Object.fromEntries(Object.entries(CAMPOS_FICHA).map(([api, col]) => [col, api]));
  for (const [coluna, [min, max]] of Object.entries(INTEIROS)) {
    if (!(coluna in dados) || dados[coluna] === null) continue;
    const n = typeof dados[coluna] === 'string' ? Number(dados[coluna]) : dados[coluna];
    if (!Number.isInteger(n) || n < min || n > max) erros[campoDaApi[coluna]] = `Use um número inteiro de ${min} a ${max}.`;
    else dados[coluna] = n;
  }
  if ('area_terreno_m2' in dados && dados.area_terreno_m2 !== null) {
    const n = typeof dados.area_terreno_m2 === 'string' ? Number(dados.area_terreno_m2) : dados.area_terreno_m2;
    if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) erros.areaTerrenoM2 = 'Informe a área do terreno em m².';
    else dados.area_terreno_m2 = Math.round(n * 100) / 100;
  }
  for (const coluna of TEXTOS) {
    if (!(coluna in dados) || dados[coluna] === null) continue;
    const t = String(dados[coluna]).trim();
    if (t.length < 2 || t.length > 120) erros[campoDaApi[coluna]] = 'Use de 2 a 120 caracteres.';
    else dados[coluna] = t;
  }
  if ('registro_data' in dados && dados.registro_data !== null) {
    const d = String(dados.registro_data);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) erros.registroData = 'Use o formato AAAA-MM-DD.';
    else if (d > agora().toISOString().slice(0, 10)) erros.registroData = 'A data do registro não pode ser no futuro.';
  }
}

module.exports = { CAMPOS_FICHA, extrairFicha, validarFicha };

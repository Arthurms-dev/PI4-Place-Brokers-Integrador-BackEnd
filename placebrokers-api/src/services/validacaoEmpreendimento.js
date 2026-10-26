'use strict';

// Nomes da API e colunas do banco. Campos opcionais vazios continuam sendo null.
const NUMERICOS = {
  quartosMin: { coluna: 'quartos_min', inteiro: true, max: 32767 },
  quartosMax: { coluna: 'quartos_max', inteiro: true, max: 32767 },
  vagasMin: { coluna: 'vagas_min', inteiro: true, max: 32767 },
  vagasMax: { coluna: 'vagas_max', inteiro: true, max: 32767 },
  areaMin: { coluna: 'area_min', max: 999999.99 },
  areaMax: { coluna: 'area_max', max: 999999.99 },
  precoMin: { coluna: 'preco_min', max: 9999999999.99 },
  precoMax: { coluna: 'preco_max', max: 9999999999.99 },
  latitude: { coluna: 'latitude', min: -90, max: 90, coordenada: true },
  longitude: { coluna: 'longitude', min: -180, max: 180, coordenada: true },
};

const FAIXAS = [
  ['quartosMin', 'quartosMax'],
  ['vagasMin', 'vagasMax'],
  ['areaMin', 'areaMax'],
  ['precoMin', 'precoMax'],
];

function normalizarNumeros(entrada) {
  const dados = { ...entrada };
  for (const campo of Object.keys(NUMERICOS)) {
    if (typeof dados[campo] === 'string' && !dados[campo].trim()) dados[campo] = null;
  }
  return dados;
}

function validarNumeros(dados, atual = {}) {
  const erros = {};
  for (const [campo, regra] of Object.entries(NUMERICOS)) {
    const valor = dados[campo];
    if (valor == null) continue;
    if (typeof valor !== 'number' || !Number.isFinite(valor)) {
      erros[campo] = 'Informe um número válido.';
    } else if (valor < (regra.min ?? 0) || valor > regra.max) {
      erros[campo] = regra.coordenada
        ? 'Coordenada fora do intervalo válido.'
        : `Informe um valor entre 0 e ${regra.max.toLocaleString('pt-BR')}.`;
    } else if (regra.inteiro && !Number.isInteger(valor)) {
      erros[campo] = 'Informe um número inteiro válido.';
    }
    if (erros[campo] && regra.coordenada) erros.coords = erros[campo];
  }

  for (const [minimo, maximo] of FAIXAS) {
    // Não bloquear edição de texto por uma inconsistência antiga não tocada.
    if (dados[minimo] === undefined && dados[maximo] === undefined) continue;
    if (erros[minimo] || erros[maximo]) continue;
    const valor = (campo) => dados[campo] !== undefined
      ? dados[campo]
      : atual[NUMERICOS[campo].coluna];
    const min = valor(minimo);
    const max = valor(maximo);
    if (min == null || max == null) continue;
    if (Number(min) > Number(max)) {
      const campo = dados[maximo] !== undefined ? maximo : minimo;
      erros[campo] = 'O máximo não pode ser menor que o mínimo.';
    }
  }
  return erros;
}

// FormData transmite números como texto. Não transformar entradas inválidas em null.
function numeroDoFormulario(valor) {
  if (valor == null || (typeof valor === 'string' && !valor.trim())) return null;
  if (typeof valor === 'number') return valor;
  if (typeof valor !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(valor.trim())) {
    return NaN;
  }
  return Number(valor.trim());
}

module.exports = { normalizarNumeros, validarNumeros, numeroDoFormulario };

'use strict';

// Andamento da obra (por módulo/torre) que o cadastro informa todo mês.
const LIMITE_MODULOS = 10;

const arredondar = (v) => Math.round(v * 100) / 100;

/**
 * Valida e normaliza os campos de andamento já no nome das colunas.
 * Altera `dados` (normaliza) e preenche `erros` com as chaves que a tela usa.
 * @param {object} dados colunas que vão para o banco
 * @param {object} erros
 * @param {object} [atual] linha atual (para checar o estado final na edição)
 * @param {Date} [hoje]
 */
function validarAndamento(dados, erros, atual = {}, hoje = new Date()) {
  if ('andamento_obra' in dados) {
    const lista = dados.andamento_obra ?? [];
    if (!Array.isArray(lista) || lista.length > LIMITE_MODULOS) {
      erros.andamentoObra = `Informe até ${LIMITE_MODULOS} módulos.`;
    } else {
      const normal = [];
      for (const item of lista) {
        const modulo = String(item?.modulo ?? '').trim();
        const percentual = Number(item?.percentual);
        if (!modulo || modulo.length > 60) {
          erros.andamentoObra = 'Cada módulo precisa de um nome (até 60 letras).';
          break;
        }
        if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
          erros.andamentoObra = 'O percentual vai de 0 a 100.';
          break;
        }
        normal.push({ modulo, percentual: arredondar(percentual) });
      }
      dados.andamento_obra = normal;
    }
  }

  if ('andamento_referencia' in dados && dados.andamento_referencia != null) {
    const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(String(dados.andamento_referencia));
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) {
      erros.andamentoReferencia = 'Informe o mês da medição (AAAA-MM).';
    } else {
      const mes = `${m[1]}-${m[2]}`;
      const mesAtual = hoje.toISOString().slice(0, 7);
      if (mes > mesAtual) erros.andamentoReferencia = 'O mês da medição não pode ser no futuro.';
      dados.andamento_referencia = `${mes}-01`;
    }
  }

  if ('andamento_fonte_url' in dados && dados.andamento_fonte_url != null) {
    const url = String(dados.andamento_fonte_url).trim();
    if (!/^https:\/\/\S+$/.test(url) || url.length > 500) erros.andamentoFonteUrl = 'Use um link https.';
    dados.andamento_fonte_url = url || null;
  }

  // Com módulos preenchidos, o mês da medição é obrigatório (sem ele não dá para saber se está atual).
  const finalLista = 'andamento_obra' in dados ? dados.andamento_obra : atual.andamento_obra;
  const finalRef = 'andamento_referencia' in dados ? dados.andamento_referencia : atual.andamento_referencia;
  if (Array.isArray(finalLista) && finalLista.length > 0 && !finalRef && !erros.andamentoReferencia) {
    erros.andamentoReferencia = 'Informe o mês da medição.';
  }
}

module.exports = { validarAndamento, LIMITE_MODULOS };

'use strict';

// Números de atendimento da equipe para o gerente: quem está com lead parado e quanto cada
// corretor demora para fazer o primeiro contato. Tudo calculado do que o sistema já registra
// (quando o lead chegou para o corretor e quando ele ligou ou abriu o WhatsApp pelo app).

const MIN = 60 * 1000;
const CONTATO = new Set(['ligacao', 'whatsapp']);

/** Momento em que o lead passou a ser responsabilidade do corretor. */
const chegada = (lead) => new Date(lead.atribuido_em ?? lead.criado_em);

function mediana(valores) {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : Math.round((v[meio - 1] + v[meio]) / 2);
}

/**
 * @param {object} dados
 * @param {{ id: string, nome: string }[]} dados.membros corretores da equipe
 * @param {object[]} dados.leads leads dos corretores (id, nome, status, criado_em, atribuido_em, corretor_id, empreendimento)
 * @param {object[]} dados.atividades atividades de contato (lead_id, tipo, criado_em)
 * @param {object[]} dados.agendamentos (corretor_id, tipo, status, criado_em)
 * @param {object[]} dados.vendas (corretor_id, status, valor, criado_em)
 * @param {Date} [dados.agora]
 * @param {number} [dados.dias] período dos números (padrão 30)
 * @param {number} [dados.limiteMin] minutos para o lead novo contar como "sem atendimento" (padrão 15)
 */
function calcularDesempenho({ membros, leads, atividades, agendamentos, vendas, agora = new Date(), dias = 30, limiteMin = 15 }) {
  const desde = new Date(agora.getTime() - dias * 24 * 60 * MIN);
  const nomes = new Map(membros.map((m) => [m.id, m.nome]));

  const primeiroContato = new Map();
  for (const a of atividades) {
    if (!CONTATO.has(a.tipo)) continue;
    const t = new Date(a.criado_em);
    const atual = primeiroContato.get(a.lead_id);
    if (!atual || t < atual) primeiroContato.set(a.lead_id, t);
  }

  const semAtendimento = leads
    .filter((l) => l.status === 'novo' && nomes.has(l.corretor_id) && !primeiroContato.has(l.id))
    .map((l) => ({
      id: l.id,
      nome: l.nome,
      empreendimento: l.empreendimento?.nome ?? null,
      corretor: { id: l.corretor_id, nome: nomes.get(l.corretor_id) },
      desde: chegada(l).toISOString(),
      minutos: Math.max(0, Math.floor((agora - chegada(l)) / MIN)),
    }))
    .filter((l) => l.minutos >= limiteMin)
    .sort((a, b) => b.minutos - a.minutos);

  const corretores = membros.map((m) => {
    const recebidos = leads.filter((l) => l.corretor_id === m.id && chegada(l) >= desde);
    const tempos = [];
    let atendidos = 0;
    for (const l of recebidos) {
      const contato = primeiroContato.get(l.id);
      if (contato || l.status !== 'novo') atendidos += 1;
      if (contato) tempos.push(Math.max(0, Math.round((contato - chegada(l)) / MIN)));
    }
    const doPeriodo = (lista) => lista.filter((x) => x.corretor_id === m.id && new Date(x.criado_em) >= desde);
    const confirmadas = doPeriodo(vendas).filter((v) => v.status === 'confirmada');
    return {
      id: m.id,
      nome: m.nome,
      recebidos: recebidos.length,
      atendidos,
      tempoRespostaMin: mediana(tempos),
      visitas: doPeriodo(agendamentos).filter((a) => a.tipo === 'visita_imovel' && a.status !== 'cancelado').length,
      vendas: confirmadas.length,
      vgv: confirmadas.reduce((t, v) => t + Number(v.valor || 0), 0),
    };
  }).sort((a, b) => b.recebidos - a.recebidos || a.nome.localeCompare(b.nome, 'pt-BR'));

  const soma = (k) => corretores.reduce((t, c) => t + c[k], 0);
  const todosTempos = [];
  for (const l of leads) {
    const contato = primeiroContato.get(l.id);
    if (contato && nomes.has(l.corretor_id) && chegada(l) >= desde) todosTempos.push(Math.max(0, Math.round((contato - chegada(l)) / MIN)));
  }

  return {
    dias,
    limiteMin,
    semAtendimento,
    corretores,
    equipe: {
      recebidos: soma('recebidos'),
      atendidos: soma('atendidos'),
      tempoRespostaMin: mediana(todosTempos),
      visitas: soma('visitas'),
      vendas: soma('vendas'),
      vgv: soma('vgv'),
    },
  };
}

module.exports = { calcularDesempenho, mediana };

'use strict';

const { supabaseAdmin } = require('../config/supabase');

const AGENDAMENTO_SELECT = `
  id,
  tipo,
  data_hora,
  duracao_minutos,
  status,
  local,
  observacoes,
  motivo_cancelamento,
  interesse_apos_visita,
  lead_origem_id,
  criado_em,
  atualizado_em,
  cliente:clientes ( id, nome, telefone ),
  corretor:profiles ( id, nome ),
  empreendimento:empreendimentos ( id, nome, bairro, cidade, uf )
`;

class AgendamentoRepository {
  /** @returns {Promise<object[]>} */
  async listar() {
    const { data, error } = await supabaseAdmin
      .from('agendamentos')
      .select(AGENDAMENTO_SELECT)
      .order('data_hora', { ascending: true });
    if (error) throw error;
    return data;
  }

  /** @param {string} id @returns {Promise<object|null>} */
  async buscarPorId(id) {
    const { data, error } = await supabaseAdmin
      .from('agendamentos')
      .select(AGENDAMENTO_SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /**
   * @param {string} corretorId
   * @param {string} dataISO
   * @returns {Promise<object[]>}
   */
  async listarPorCorretorEData(corretorId, dataISO) {
    const inicioDoDia = `${dataISO}T00:00:00.000Z`;
    const fimDoDia = `${dataISO}T23:59:59.999Z`;
    const { data, error } = await supabaseAdmin
      .from('agendamentos')
      .select(AGENDAMENTO_SELECT)
      .eq('corretor_id', corretorId)
      .neq('status', 'cancelado')
      .gte('data_hora', inicioDoDia)
      .lte('data_hora', fimDoDia);
    if (error) throw error;
    return data;
  }

  /**
   * @param {{ tipo: string, dataHora: string, duracaoMinutos: number, clienteId: string,
   *   corretorId: string, empreendimentoId: string|null, local: string|null,
   *   observacoes: string|null, leadOrigemId: string|null }} dados
   * @returns {Promise<object>}
   */
  async criar({ tipo, dataHora, duracaoMinutos, clienteId, corretorId, empreendimentoId, local, observacoes, leadOrigemId }) {
    const { data, error } = await supabaseAdmin
      .from('agendamentos')
      .insert({
        tipo,
        data_hora: dataHora,
        duracao_minutos: duracaoMinutos ?? 60,
        status: 'agendado',
        cliente_id: clienteId,
        corretor_id: corretorId,
        empreendimento_id: empreendimentoId ?? null,
        local: local ?? null,
        observacoes: observacoes ?? null,
        lead_origem_id: leadOrigemId ?? null,
      })
      .select(AGENDAMENTO_SELECT)
      .single();
    if (error) throw error;
    return data;
  }

  /**
   * @param {string} id
   * @param {string} status
   * @param {{ motivoCancelamento?: string, interesseAposVisita?: string }} [extra]
   * @returns {Promise<object|null>}
   */
  async atualizarStatus(id, status, { motivoCancelamento, interesseAposVisita } = {}) {
    const atualizacao = { status };
    if (motivoCancelamento !== undefined) atualizacao.motivo_cancelamento = motivoCancelamento;
    if (interesseAposVisita !== undefined) atualizacao.interesse_apos_visita = interesseAposVisita;

    const { data, error } = await supabaseAdmin
      .from('agendamentos')
      .update(atualizacao)
      .eq('id', id)
      .select(AGENDAMENTO_SELECT)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /** @param {string} id @param {string} dataHora @returns {Promise<object|null>} */
  async remarcar(id, dataHora) {
    const { data, error } = await supabaseAdmin
      .from('agendamentos')
      .update({ data_hora: dataHora })
      .eq('id', id)
      .select(AGENDAMENTO_SELECT)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
}

module.exports = { AgendamentoRepository };
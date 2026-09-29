'use strict';

const { supabaseAdmin } = require('../config/supabase');

class MetricasRepository {

  async inserirEvento({ tipo, empreendimento_id, usuario_id, sessao_id }) {
    const { error } = await supabaseAdmin
      .from('eventos_acesso')
      .insert({ tipo, empreendimento_id, usuario_id, sessao_id });
    if (error) throw error;
  }

  async existeEventoRecente({ tipo, sessao_id, empreendimento_id, desde }) {
    let query = supabaseAdmin
      .from('eventos_acesso')
      .select('id', { count: 'exact', head: true })
      .eq('tipo', tipo)
      .eq('sessao_id', sessao_id)
      .gte('criado_em', desde);
    query = empreendimento_id ? query.eq('empreendimento_id', empreendimento_id) : query.is('empreendimento_id', null);

    const { count, error } = await query;
    if (error) throw error;
    return (count ?? 0) > 0;
  }

  /** @param {string} de @param {string} ate */
  async acessosPorDia(de, ate) {
    const { data, error } = await supabaseAdmin.rpc('dashboard_acessos_por_dia', { p_de: de, p_ate: ate });
    if (error) throw error;
    return data;
  }

  async imoveisMaisProcurados(deTs, ateTs, limite = 5) {
    const { data, error } = await supabaseAdmin.rpc('dashboard_imoveis_mais_procurados', {
      p_de: deTs,
      p_ate: ateTs,
      p_limite: limite,
    });
    if (error) throw error;
    return data;
  }

  /** @param {string[]|null} corretorIds null = todos */
  async vgv(deTs, ateTs, corretorIds = null) {
    const { data, error } = await supabaseAdmin.rpc('dashboard_vgv', {
      p_de: deTs,
      p_ate: ateTs,
      p_corretores: corretorIds,
    });
    if (error) throw error;
    return data?.[0] ?? { total: 0, quantidade: 0 };
  }

  async contarAgendamentos(deTs, ateTs) {
    const { count, error } = await supabaseAdmin
      .from('agendamentos')
      .select('id', { count: 'exact', head: true })
      .gte('data_hora', deTs)
      .lte('data_hora', ateTs);
    if (error) throw error;
    return count ?? 0;
  }
}

module.exports = { MetricasRepository };
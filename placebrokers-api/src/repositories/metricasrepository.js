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


  /** @param {string} de YYYY-MM-DD @param {string} ate */
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

  /** @param {string[]|null} corretorIds */
  async vgv(deTs, ateTs, corretorIds = null) {
    const { data, error } = await supabaseAdmin.rpc('dashboard_vgv', {
      p_de: deTs,
      p_ate: ateTs,
      p_corretores: corretorIds,
    });
    if (error) throw error;
    return data?.[0] ?? { total: 0, quantidade: 0 };
  }

  async agendamentosPorDia(de, ate) {
    const { data, error } = await supabaseAdmin.rpc('dashboard_agendamentos_por_dia', { p_de: de, p_ate: ate });
    if (error) throw error;
    return data;
  }

  async contarEventos({ tipo, deTs, ateTs }) {
    const { count, error } = await supabaseAdmin
      .from('eventos_acesso')
      .select('id', { count: 'exact', head: true })
      .eq('tipo', tipo)
      .is('usuario_id', null)
      .gte('criado_em', deTs)
      .lte('criado_em', ateTs);
    if (error) throw error;
    return count ?? 0;
  }

  async contarLeads(deTs, ateTs, status) {
    let query = supabaseAdmin
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .gte('criado_em', deTs)
      .lte('criado_em', ateTs);
    if (status) query = query.eq('status', status);
    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
  }

  async leadsRecentes(limite = 5) {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .select('id, nome, status, criado_em, empreendimento:empreendimentos ( nome )')
      .neq('status', 'perdido')
      .order('criado_em', { ascending: false })
      .limit(limite);
    if (error) throw error;
    return data;
  }
}

module.exports = { MetricasRepository };
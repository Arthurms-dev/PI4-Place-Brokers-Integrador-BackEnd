'use strict';

const { supabaseAdmin } = require('../config/supabase');

/** Dados brutos para o painel de atendimento da equipe (só dos corretores informados). */
class DesempenhoRepository {
  async carregar(corretorIds, desdeIso) {
    if (!corretorIds.length) return { leads: [], atividades: [], agendamentos: [], vendas: [] };

    const [leads, agendamentos, vendas] = await Promise.all([
      supabaseAdmin
        .from('leads')
        .select('id, nome, status, criado_em, atribuido_em, corretor_id, empreendimento:empreendimentos(nome)')
        .in('corretor_id', corretorIds)
        .or(`status.eq.novo,criado_em.gte.${desdeIso},atribuido_em.gte.${desdeIso}`),
      supabaseAdmin.from('agendamentos').select('corretor_id, tipo, status, criado_em').in('corretor_id', corretorIds).gte('criado_em', desdeIso),
      supabaseAdmin.from('vendas').select('corretor_id, status, valor, criado_em').in('corretor_id', corretorIds).gte('criado_em', desdeIso),
    ]);
    for (const r of [leads, agendamentos, vendas]) if (r.error) throw r.error;

    const ids = (leads.data ?? []).map((l) => l.id);
    let atividades = [];
    // Em lotes, para não estourar o tamanho da URL quando a equipe tem muitos leads.
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabaseAdmin
        .from('lead_atividades')
        .select('lead_id, tipo, criado_em')
        .in('lead_id', ids.slice(i, i + 200))
        .in('tipo', ['ligacao', 'whatsapp']);
      if (error) throw error;
      atividades = atividades.concat(data ?? []);
    }

    return { leads: leads.data ?? [], atividades, agendamentos: agendamentos.data ?? [], vendas: vendas.data ?? [] };
  }
}

module.exports = { DesempenhoRepository };

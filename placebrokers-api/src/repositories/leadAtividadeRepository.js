'use strict';
const { supabaseAdmin } = require('../config/supabase');

const FIELDS = 'id, lead_id, autor_id, tipo, descricao, proximo_contato_em, criado_em';
class LeadAtividadeRepository {
  async listar(leadId) {
    const { data, error } = await supabaseAdmin.from('lead_atividades')
      .select(FIELDS).eq('lead_id', leadId).order('criado_em', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }
  /** Atividades com próximo contato marcado, nos leads de um corretor, dentro da janela. */
  async proximosDoCorretor(corretorId, desde, ate) {
    const { data, error } = await supabaseAdmin.from('lead_atividades')
      .select(`${FIELDS}, lead:leads!inner(id, nome, telefone, status, corretor_id, empreendimento:empreendimentos(id, nome))`)
      .eq('lead.corretor_id', corretorId)
      .gte('proximo_contato_em', desde)
      .lte('proximo_contato_em', ate)
      .order('proximo_contato_em', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }
  /** Data da atividade mais recente de cada lead (para saber se o retorno já foi feito). */
  async ultimaAtividadePorLead(leadIds) {
    if (!leadIds.length) return {};
    const { data, error } = await supabaseAdmin.from('lead_atividades')
      .select('lead_id, criado_em').in('lead_id', leadIds).order('criado_em', { ascending: false });
    if (error) throw error;
    const ultima = {};
    for (const row of data ?? []) if (!ultima[row.lead_id]) ultima[row.lead_id] = row.criado_em;
    return ultima;
  }
  async criar(dados) {
    const { data, error } = await supabaseAdmin.from('lead_atividades')
      .insert(dados).select(FIELDS).single();
    if (error) throw error;
    return data;
  }
}
module.exports = { LeadAtividadeRepository };

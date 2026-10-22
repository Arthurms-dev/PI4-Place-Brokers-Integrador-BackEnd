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
  async criar(dados) {
    const { data, error } = await supabaseAdmin.from('lead_atividades')
      .insert(dados).select(FIELDS).single();
    if (error) throw error;
    return data;
  }
}
module.exports = { LeadAtividadeRepository };

'use strict';

const { supabaseAdmin } = require('../config/supabase');

class ClienteRepository {
  /**
   * @param {{ nome: string, email: string|null, telefone: string|null, corretorId: string, leadId: string }} dados
   * @returns {Promise<object>}
   */
  async criar({ nome, email, telefone, corretorId, leadId }) {
    const { data, error } = await supabaseAdmin
      .from('clientes')
      .insert({ nome, email, telefone, corretor_id: corretorId, lead_id: leadId })
      .select('id, nome, email, telefone, corretor_id, lead_id, criado_em')
      .single();
    if (error) throw error;
    return data;
  }
}

module.exports = { ClienteRepository };
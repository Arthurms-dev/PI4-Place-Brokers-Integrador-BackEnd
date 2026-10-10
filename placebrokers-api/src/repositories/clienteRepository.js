'use strict';

const { supabaseAdmin } = require('../config/supabase');

const CLIENTE_SELECT = 'id, nome, email, telefone, observacoes, corretor_id, lead_id, criado_em';

class ClienteRepository {
  async criar({ nome, email, telefone, observacoes, corretorId, leadId }) {
    const { data, error } = await supabaseAdmin
      .from('clientes')
      .insert({
        nome,
        email: email ?? null,
        telefone: telefone ?? null,
        observacoes: observacoes ?? null,
        corretor_id: corretorId,
        lead_id: leadId ?? null,
      })
      .select(CLIENTE_SELECT)
      .single();
    if (error) throw error;
    return data;
  }

  async listar() {
    const { data, error } = await supabaseAdmin.from('clientes').select(CLIENTE_SELECT).order('criado_em', { ascending: false });
    if (error) throw error;
    return data;
  }

  async listarPorCorretor(corretorId) {
    const { data, error } = await supabaseAdmin
      .from('clientes')
      .select(CLIENTE_SELECT)
      .eq('corretor_id', corretorId)
      .order('criado_em', { ascending: false });
    if (error) throw error;
    return data;
  }
}

module.exports = { ClienteRepository };
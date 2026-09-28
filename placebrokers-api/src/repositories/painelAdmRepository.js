'use strict';

const { supabaseAdmin } = require('../config/supabase');

class PainelAdmRepository {
  async listarAvisosSeguranca(limite = 20) {
    const { data, error } = await supabaseAdmin
      .from('avisos_seguranca')
      .select('id, titulo, descricao, severidade, criado_em')
      .order('criado_em', { ascending: false })
      .limit(limite);
    if (error) throw error;
    return data;
  }

  async listarMelhorias(limite = 20) {
    const { data, error } = await supabaseAdmin
      .from('melhorias')
      .select('id, titulo, descricao, status, criado_em')
      .order('criado_em', { ascending: false })
      .limit(limite);
    if (error) throw error;
    return data;
  }

  async listarModificacoes(limite = 20) {
    const { data, error } = await supabaseAdmin
      .from('modificacoes')
      .select('id, titulo, descricao, criado_em, autor:profiles(nome)')
      .order('criado_em', { ascending: false })
      .limit(limite);
    if (error) throw error;
    return data;
  }
}

module.exports = { PainelAdmRepository };
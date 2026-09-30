'use strict';

const { supabaseAdmin } = require('../config/supabase');

class VendaRepository {
  async listarTodas() {
    const { data, error } = await supabaseAdmin.from('vendas').select('*').order('criado_em', { ascending: false });
    if (error) throw error;
    return data;
  }

  async listarPorCorretor(corretorId) {
    const { data, error } = await supabaseAdmin
      .from('vendas')
      .select('*')
      .eq('corretor_id', corretorId)
      .order('criado_em', { ascending: false });
    if (error) throw error;
    return data;
  }

  /** @param {string[]} corretorIds */
  async listarPorCorretores(corretorIds) {
    if (!corretorIds.length) return [];
    const { data, error } = await supabaseAdmin
      .from('vendas')
      .select('*')
      .in('corretor_id', corretorIds)
      .order('criado_em', { ascending: false });
    if (error) throw error;
    return data;
  }

  async buscarPorId(id) {
    const { data, error } = await supabaseAdmin.from('vendas').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async criar(dados) {
    const { data, error } = await supabaseAdmin.from('vendas').insert(dados).select().single();
    if (error) throw error;
    return data;
  }

  async atualizar(id, dados) {
    const { data, error } = await supabaseAdmin.from('vendas').update(dados).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
}

module.exports = { VendaRepository };
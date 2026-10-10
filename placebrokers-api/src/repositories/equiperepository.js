'use strict';

const { supabaseAdmin } = require('../config/supabase');

const CAMPOS = 'id, nome, email, telefone, cargo, vinculo, creci, uf, status, ativo, equipe_id, criado_em, aprovado_em';

class EquipeRepository {

  /** @param {{ status?: string, cargo?: string }} filtros */
  async listar({ status, cargo } = {}) {
    let query = supabaseAdmin.from('profiles').select(CAMPOS).order('criado_em', { ascending: false });
    if (status) query = query.eq('status', status);
    if (cargo) query = query.eq('cargo', cargo);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async buscarPorId(id) {
    const { data, error } = await supabaseAdmin.from('profiles').select(CAMPOS).eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async atualizar(id, dados) {
    const { data, error } = await supabaseAdmin.from('profiles').update(dados).eq('id', id).select(CAMPOS).single();
    if (error) throw error;
    return data;
  }

  async listarTimes() {
    const { data, error } = await supabaseAdmin.from('equipes').select('*').order('nome');
    if (error) throw error;
    return data;
  }

  async listarTimesDoGerente(gerenteId) {
    const { data, error } = await supabaseAdmin.from('equipes').select('*').eq('gerente_id', gerenteId);
    if (error) throw error;
    return data;
  }

  async listarTimesPorDiretoria(diretoriaId) {
    const { data, error } = await supabaseAdmin.from('equipes').select('*').eq('diretoria_id', diretoriaId);
    if (error) throw error;
    return data;
  }

  async buscarTime(id) {
    const { data, error } = await supabaseAdmin.from('equipes').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async criarTime({ nome, gerente_id, diretoria_id, sede }) {
    const { data, error } = await supabaseAdmin
      .from('equipes')
      .insert({ nome, gerente_id, diretoria_id, sede: sede ?? null })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async atualizarTime(id, dados) {
    const { data, error } = await supabaseAdmin.from('equipes').update(dados).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }

  async removerTime(id) {
    const { error } = await supabaseAdmin.from('equipes').delete().eq('id', id);
    if (error) throw error;
  }


  async listarDiretorias() {
    const { data, error } = await supabaseAdmin.from('diretorias').select('*').order('nome');
    if (error) throw error;
    return data;
  }

  async buscarDiretoria(id) {
    const { data, error } = await supabaseAdmin.from('diretorias').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async criarDiretoria({ nome }) {
    const { data, error } = await supabaseAdmin.from('diretorias').insert({ nome }).select().single();
    if (error) throw error;
    return data;
  }
}

module.exports = { EquipeRepository };
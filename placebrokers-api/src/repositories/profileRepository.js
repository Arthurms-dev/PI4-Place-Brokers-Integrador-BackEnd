'use strict';

const { supabaseAdmin } = require('../config/supabase');

class ProfileRepository {
  /** @param {string} id @returns {Promise<object|null>} */
  async construtoraExiste(id) {
    if (!id) return false;
    const { data, error } = await supabaseAdmin.from('construtoras').select('id').eq('id', id).maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }

  async findById(id) {
    const { data, error } = await supabaseAdmin.from('profiles').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async findByEmail(email) {
    const { data, error } = await supabaseAdmin.from('profiles')
      .select('id, status').eq('email', email).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  }

  /** Dados mínimos para o e-mail de "Esqueci minha senha". */
  async buscarParaRecuperacao(email) {
    const { data, error } = await supabaseAdmin.from('profiles')
      .select('id, nome, ativo, status').eq('email', email).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  }

  /**
   * @param {{ id: string, nome: string, email: string, cargo: string }} profile
   * @returns {Promise<object>}
   */
  async create({ id, nome, email, cargo, vinculo = null, creci = null, uf = null, construtoraId = null, status = 'pendente' }) {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .insert({ id, nome, email, cargo, vinculo, creci, uf, construtora_id: construtoraId, status })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** @param {string} id @param {object} dados */
  async atualizar(id, dados) {
    const { data, error } = await supabaseAdmin.from('profiles').update(dados).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
}

module.exports = { ProfileRepository };
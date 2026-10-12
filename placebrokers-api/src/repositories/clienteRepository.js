'use strict';

const { supabaseAdmin } = require('../config/supabase');

const CLIENTE_SELECT = `
  id,
  nome,
  email,
  telefone,
  observacoes,
  criado_em,
  corretor:profiles ( id, nome ),
  lead:leads ( id, nome )
`;

class ClienteRepository {
  /** @returns {Promise<object[]>} */
  async listar() {
    const { data, error } = await supabaseAdmin
      .from('clientes')
      .select(CLIENTE_SELECT)
      .order('criado_em', { ascending: false });
    if (error) throw error;
    return data;
  }

  /** @param {string} id @returns {Promise<object|null>} */
  async buscarPorId(id) {
    const { data, error } = await supabaseAdmin
      .from('clientes')
      .select(CLIENTE_SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /**
   * @param {string} corretorId
   * @returns {Promise<object[]>}
  */
  async listarPorCorretor(corretorId) {
    const { data, error } = await supabaseAdmin
      .from('clientes')
      .select(CLIENTE_SELECT)
      .eq('corretor_id', corretorId)
      .order('criado_em', { ascending: false });
    if (error) throw error;
    return data;
  }

  /**
   * @param {{ nome: string, email: string|null, telefone: string|null, corretorId: string,
   *   leadId?: string|null, observacoes?: string|null }} dados
   * @returns {Promise<object>}
   */
  async criar({ nome, email, telefone, corretorId, leadId, observacoes }) {
    const { data, error } = await supabaseAdmin
      .from('clientes')
      .insert({
        nome,
        email,
        telefone,
        corretor_id: corretorId,
        lead_id: leadId ?? null,
        observacoes: observacoes ?? null,
      })
      .select(CLIENTE_SELECT)
      .single();
    if (error) throw error;
    return data;
  }

  /**
   * @param {string} id
   * @param {{ nome?: string, email?: string|null, telefone?: string|null,
   *   corretorId?: string, observacoes?: string|null }} dados
   * @returns {Promise<object|null>}
   */
  async atualizar(id, { nome, email, telefone, corretorId, observacoes }) {
    const atualizacao = {};
    if (nome !== undefined) atualizacao.nome = nome;
    if (email !== undefined) atualizacao.email = email;
    if (telefone !== undefined) atualizacao.telefone = telefone;
    if (corretorId !== undefined) atualizacao.corretor_id = corretorId;
    if (observacoes !== undefined) atualizacao.observacoes = observacoes;

    const { data, error } = await supabaseAdmin
      .from('clientes')
      .update(atualizacao)
      .eq('id', id)
      .select(CLIENTE_SELECT)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
}

module.exports = { ClienteRepository };
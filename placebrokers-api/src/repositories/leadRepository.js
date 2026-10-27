'use strict';

const { supabaseAdmin } = require('../config/supabase');

const LEAD_SELECT = `
  id,
  nome,
  email,
  telefone,
  origem,
  mensagem,
  status,
  criado_em,
  empreendimento:empreendimentos ( id, nome, bairro, cidade, uf ),
  corretor:profiles ( id, nome )
`;

class LeadRepository {
  /** @returns {Promise<object[]>} */
  async listar() {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .select(LEAD_SELECT)
      .order('criado_em', { ascending: false });
    if (error) throw error;
    return data;
  }

  // Evita trazer leads de outras equipes para memoria do servidor.
  async listarPorCorretores(corretorIds) {
    if (!corretorIds.length) return [];
    const { data, error } = await supabaseAdmin
      .from('leads')
      .select(LEAD_SELECT)
      .in('corretor_id', corretorIds)
      .order('criado_em', { ascending: false });
    if (error) throw error;
    return data;
  }

  async listarPorCorretor(corretorId) {
     const { data, error } = await supabaseAdmin
       .from('leads')
       .select(LEAD_SELECT)
       .eq('corretor_id', corretorId)
       .order('criado_em', { ascending: false });
     if (error) throw error;
     return data;
   }
   
  /** @param {string} id @returns {Promise<object|null>} */
  async buscarPorId(id) {
    const { data, error } = await supabaseAdmin.from('leads').select(LEAD_SELECT).eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }

  /** @param {string} id @param {string} status @returns {Promise<object|null>} */
  async atualizarStatus(id, status) {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .update({ status })
      .eq('id', id)
      .select(LEAD_SELECT)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /** @param {string} id @param {string|null} corretorId @returns {Promise<object|null>} */
  async atribuirCorretor(id, corretorId) {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .update({ corretor_id: corretorId })
      .eq('id', id)
      .select(LEAD_SELECT)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /**
   * Lead vindo do site: se o e-mail ou o telefone já existir, registra o contato no lead
   * existente (numa transação no banco) em vez de criar outro.
   * @param {{ nome: string, email: string, telefone: string, empreendimentoId: string|null, mensagem: string|null }} dados
   * @returns {Promise<{ leadId: string, repetido: boolean }>}
   */
  async registrarDoSite({ nome, email, telefone, empreendimentoId, mensagem }) {
    const { data, error } = await supabaseAdmin.rpc('registrar_lead_site', {
      p_nome: nome,
      p_email: email,
      p_telefone: telefone,
      p_empreendimento_id: empreendimentoId ?? null,
      p_mensagem: mensagem ?? null,
    });
    if (error) throw error;
    const linha = Array.isArray(data) ? data[0] : data;
    return { leadId: linha?.lead_id, repetido: Boolean(linha?.repetido) };
  }

  /**
   * @param {{ nome: string, email: string, telefone: string, empreendimentoId: string|null, mensagem: string|null, origem: string }} dados
   * @returns {Promise<object>}
   */
  async criar({ nome, email, telefone, empreendimentoId, mensagem, origem }) {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .insert({
        nome,
        email,
        telefone,
        empreendimento_id: empreendimentoId ?? null,
        mensagem: mensagem ?? null,
        origem,
        status: 'novo',
      })
      .select(LEAD_SELECT)
      .single();
    if (error) throw error;
    return data;
  }
}

module.exports = { LeadRepository };
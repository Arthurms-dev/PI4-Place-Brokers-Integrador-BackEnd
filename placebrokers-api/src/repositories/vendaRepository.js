'use strict';

const { supabaseAdmin } = require('../config/supabase');

const SELECT = `
  *,
  corretor:profiles!corretor_id ( id, nome ),
  cliente:clientes ( id, nome ),
  empreendimento:empreendimentos ( id, nome, cidade, uf )
`;

class VendaRepository {
  async listarTodas() {
    const { data, error } = await supabaseAdmin.from('vendas').select(SELECT).order('criado_em', { ascending: false });
    if (error) throw error;
    return data;
  }

  async listarPorCorretor(corretorId) {
    const { data, error } = await supabaseAdmin
      .from('vendas')
      .select(SELECT)
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
      .select(SELECT)
      .in('corretor_id', corretorIds)
      .order('criado_em', { ascending: false });
    if (error) throw error;
    return data;
  }

  async buscarPorId(id) {
    const { data, error } = await supabaseAdmin.from('vendas').select(SELECT).eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async criar(dados) {
    const { data, error } = await supabaseAdmin.from('vendas').insert(dados).select(SELECT).single();
    if (error) throw error;
    return data;
  }

  async converterLeadDoCliente(clienteId) {
    if (!clienteId) return;
    const { data: cliente } = await supabaseAdmin.from('clientes').select('lead_id').eq('id', clienteId).maybeSingle();
    if (!cliente?.lead_id) return;
    await supabaseAdmin.from('leads').update({ status: 'convertido' }).eq('id', cliente.lead_id);
  }

  async atualizar(id, dados) {
    const { data, error } = await supabaseAdmin.from('vendas').update(dados).eq('id', id).select(SELECT).single();
    if (error) throw error;
    return data;
  }
}

module.exports = { VendaRepository };
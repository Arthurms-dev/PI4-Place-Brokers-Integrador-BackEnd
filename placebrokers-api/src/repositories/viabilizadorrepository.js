'use strict';

const { supabaseAdmin } = require('../config/supabase');

const SELECT = '*, construtora:construtoras ( id, nome )';

class ViabilizadorRepository {
  async listarProdutosDaConstrutora(construtoraId) {
    const { data, error } = await supabaseAdmin.from('empreendimentos').select(SELECT).eq('construtora_id', construtoraId).order('nome');
    if (error) throw error;
    return data;
  }

  async buscarConstrutora(id) {
    const { data, error } = await supabaseAdmin.from('construtoras').select('id, nome').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async buscarProduto(id) {
    const { data, error } = await supabaseAdmin.from('empreendimentos').select(SELECT).eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async atualizarProduto(id, dados) {
    const { data, error } = await supabaseAdmin.from('empreendimentos').update(dados).eq('id', id).select(SELECT).maybeSingle();
    if (error) throw error;
    return data;
  }

  async _contar(tabela, colunaData, empreendimentoId, desdeISO, filtrar = (q) => q) {
    let q = supabaseAdmin.from(tabela).select('*', { count: 'exact', head: true }).eq('empreendimento_id', empreendimentoId);
    if (desdeISO) q = q.gte(colunaData, desdeISO);
    const { count, error } = await filtrar(q);
    if (error) throw error;
    return count ?? 0;
  }

  visualizacoes(empreendimentoId, desdeISO) {
    return this._contar('eventos_acesso', 'criado_em', empreendimentoId, desdeISO, (q) => q.eq('tipo', 'visualizacao_empreendimento'));
  }

  leads(empreendimentoId, desdeISO) {
    return this._contar('leads', 'criado_em', empreendimentoId, desdeISO);
  }

  visitas(empreendimentoId, desdeISO) {
    return this._contar('agendamentos', 'data_hora', empreendimentoId, desdeISO, (q) => q.eq('tipo', 'visita_imovel').neq('status', 'cancelado'));
  }

  async vendas(empreendimentoId, desdeISO) {
    let q = supabaseAdmin.from('vendas').select('valor, status').eq('empreendimento_id', empreendimentoId);
    if (desdeISO) q = q.gte('criado_em', desdeISO);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }
}

module.exports = { ViabilizadorRepository };
'use strict';

const { supabaseAdmin } = require('../config/supabase');

const SELECT_PADRAO = '*, construtora:construtoras(nome)';

class EmpreendimentoRepository {
  /** @param {{ apenasPublicados: boolean }} opts */
  async listar({ apenasPublicados }) {
    let query = supabaseAdmin.from('empreendimentos').select(SELECT_PADRAO).order('atualizado_em', { ascending: false });
    if (apenasPublicados) query = query.eq('publicado', true);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async buscarPorId(id) {
    const { data, error } = await supabaseAdmin
      .from('empreendimentos')
      .select(`${SELECT_PADRAO}, imagens:empreendimento_imagens(url, ordem)`)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async criar(dados) {
    const { data, error } = await supabaseAdmin.from('empreendimentos').insert(dados).select().single();
    if (error) throw error;
    return data;
  }

  async inserirImagens(linhas) {
    if (!linhas.length) return;
    const { error } = await supabaseAdmin.from('empreendimento_imagens').insert(linhas);
    if (error) throw error;
  }
}

module.exports = { EmpreendimentoRepository };

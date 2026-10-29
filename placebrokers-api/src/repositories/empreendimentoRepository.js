'use strict';

const { supabaseAdmin } = require('../config/supabase');

const SELECT_PADRAO = [
  '*',
  'construtora:construtoras(nome)',
  'tipologias:empreendimento_tipologias(id,nome,quartos,suites,vagas,area_m2,ordem)',
  // Só para saber se há book/tabela aprovados (o serviço tira a lista da resposta).
  'documentos:empreendimento_documentos(tipo,status,validade_ate)',
].join(', ');

class EmpreendimentoRepository {
  async listar({ apenasPublicados }) {
    let query = supabaseAdmin
      .from('empreendimentos')
      // A vitrine pública precisa da galeria já na listagem (fotos do card e abertura imediata do detalhe).
      .select(`${SELECT_PADRAO}, imagens:empreendimento_imagens(url, ordem, alt)`)
      .order('atualizado_em', { ascending: false });

    if (apenasPublicados) query = query.eq('publicado', true);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async buscarPorId(id) {
    const { data, error } = await supabaseAdmin
      .from('empreendimentos')
      .select(`${SELECT_PADRAO}, imagens:empreendimento_imagens(id, url, ordem, alt)`)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async criar(dados) {
    const { data, error } = await supabaseAdmin
      .from('empreendimentos')
      .insert(dados)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async atualizar(id, dados) {
    const { data, error } = await supabaseAdmin
      .from('empreendimentos')
      .update(dados)
      .eq('id', id)
      .select(SELECT_PADRAO)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async inserirImagens(linhas) {
    if (!linhas.length) return;

    const { error } = await supabaseAdmin
      .from('empreendimento_imagens')
      .insert(linhas);

    if (error) throw error;
  }

  async adicionarImagens(linhas) {
    const { data, error } = await supabaseAdmin.from('empreendimento_imagens')
      .insert(linhas).select('id,url,alt,ordem');
    if (error) throw error;
    return data ?? [];
  }

  async removerImagem(empreendimentoId, imagemId) {
    const { data, error } = await supabaseAdmin.from('empreendimento_imagens')
      .delete().eq('empreendimento_id', empreendimentoId).eq('id', imagemId)
      .select('id').maybeSingle();
    if (error) throw error;
    return data;
  }

  async buscarTipologia(empreendimentoId, tipologiaId) {
    const { data, error } = await supabaseAdmin
      .from('empreendimento_tipologias')
      .select('*')
      .eq('empreendimento_id', empreendimentoId)
      .eq('id', tipologiaId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async criarTipologia(empreendimentoId, dados) {
    const { data, error } = await supabaseAdmin
      .from('empreendimento_tipologias')
      .insert({ empreendimento_id: empreendimentoId, ...dados })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async atualizarTipologia(empreendimentoId, tipologiaId, dados) {
    const { data, error } = await supabaseAdmin
      .from('empreendimento_tipologias')
      .update(dados)
      .eq('empreendimento_id', empreendimentoId)
      .eq('id', tipologiaId)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  }
}

module.exports = { EmpreendimentoRepository };

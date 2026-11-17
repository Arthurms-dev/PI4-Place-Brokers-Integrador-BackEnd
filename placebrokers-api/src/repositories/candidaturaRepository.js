'use strict';

const { supabaseAdmin } = require('../config/supabase');

const BUCKET_CURRICULOS = 'curriculos';
const CAMPOS_VAGA = 'id, titulo, area, unidade, descricao, aberta, criado_em, atualizado_em';
const CAMPOS_CANDIDATURA = 'id, vaga_id, nome, email, telefone, unidade, area, creci, linkedin, mensagem, curriculo_path, '
  + 'status, notas, reenvios, criado_em, atualizado_em, vaga:vagas(id, titulo)';

class CandidaturaRepository {
  async listarVagas({ apenasAbertas = false } = {}) {
    let query = supabaseAdmin.from('vagas').select(CAMPOS_VAGA).order('criado_em', { ascending: false });
    if (apenasAbertas) query = query.eq('aberta', true);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async buscarVaga(id) {
    const { data, error } = await supabaseAdmin.from('vagas').select(CAMPOS_VAGA).eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async criarVaga(dados) {
    const { data, error } = await supabaseAdmin.from('vagas').insert(dados).select(CAMPOS_VAGA).single();
    if (error) throw error;
    return data;
  }

  async atualizarVaga(id, dados) {
    const { data, error } = await supabaseAdmin.from('vagas').update(dados).eq('id', id).select(CAMPOS_VAGA).single();
    if (error) throw error;
    return data;
  }

  /** Mesma vaga (ou banco de talentos) e mesmo e-mail OU mesmo telefone = mesma pessoa. */
  async buscarMesmaPessoa({ email, telefone, vagaId }) {
    const naVaga = (q) => (vagaId ? q.eq('vaga_id', vagaId) : q.is('vaga_id', null));
    for (const [coluna, valor] of [['email', email], ['telefone', telefone]]) {
      const { data, error } = await naVaga(
        supabaseAdmin.from('candidaturas').select('id, curriculo_path, reenvios').eq(coluna, valor),
      ).limit(1).maybeSingle();
      if (error) throw error;
      if (data) return data;
    }
    return null;
  }

  async listarCandidaturas({ status, vagaId, area, unidade } = {}) {
    let query = supabaseAdmin.from('candidaturas').select(CAMPOS_CANDIDATURA).order('criado_em', { ascending: false });
    if (status) query = query.eq('status', status);
    if (vagaId === 'banco') query = query.is('vaga_id', null);
    else if (vagaId) query = query.eq('vaga_id', vagaId);
    if (area) query = query.eq('area', area);
    if (unidade) query = query.eq('unidade', unidade);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async buscarCandidatura(id) {
    const { data, error } = await supabaseAdmin.from('candidaturas').select(CAMPOS_CANDIDATURA).eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async criarCandidatura(dados) {
    const { data, error } = await supabaseAdmin.from('candidaturas').insert(dados).select('id').single();
    if (error) throw error;
    return data;
  }

  async atualizarCandidatura(id, dados) {
    const { data, error } = await supabaseAdmin.from('candidaturas').update(dados).eq('id', id).select(CAMPOS_CANDIDATURA).single();
    if (error) throw error;
    return data;
  }

  /** Candidaturas enviadas antes da data (para a limpeza de 1 ano da política de privacidade). */
  async listarAntigas(antesDe, limite = 500) {
    const { data, error } = await supabaseAdmin.from('candidaturas')
      .select('id, curriculo_path').lt('criado_em', antesDe).order('criado_em').limit(limite);
    if (error) throw error;
    return data;
  }

  async removerCandidaturas(ids) {
    if (!ids.length) return;
    const { error } = await supabaseAdmin.from('candidaturas').delete().in('id', ids);
    if (error) throw error;
  }

  async removerCurriculos(caminhos) {
    if (!caminhos.length) return;
    const { error } = await supabaseAdmin.storage.from(BUCKET_CURRICULOS).remove(caminhos);
    if (error) throw error;
  }

  async removerCandidatura(id) {
    const { error } = await supabaseAdmin.from('candidaturas').delete().eq('id', id);
    if (error) throw error;
  }

  async subirCurriculo(caminho, buffer) {
    const { error } = await supabaseAdmin.storage.from(BUCKET_CURRICULOS)
      .upload(caminho, buffer, { contentType: 'application/pdf', upsert: false });
    if (error) throw error;
  }

  async removerCurriculo(caminho) {
    if (!caminho) return;
    const { error } = await supabaseAdmin.storage.from(BUCKET_CURRICULOS).remove([caminho]);
    if (error) throw error;
  }

  /** Link temporário: o currículo nunca fica público. */
  async linkCurriculo(caminho, segundos = 300) {
    const { data, error } = await supabaseAdmin.storage.from(BUCKET_CURRICULOS)
      .createSignedUrl(caminho, segundos, { download: false });
    if (error) throw error;
    return data.signedUrl;
  }
}

module.exports = { CandidaturaRepository, BUCKET_CURRICULOS };

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
  atribuido_em,
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
      // Repasse reinicia o relógio do atendimento para o novo corretor e libera um novo aviso
      // (notificado_em nulo), senão quem recebe o lead repassado nunca é avisado.
      .update({ corretor_id: corretorId, atribuido_em: corretorId ? new Date().toISOString() : null, notificado_em: null })
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

  /** Lead captado pelo próprio corretor (indicação, plantão): já nasce na carteira dele. */
  async criarDoCorretor({ nome, email, telefone, empreendimentoId, mensagem, corretorId }) {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .insert({
        nome,
        email,
        telefone,
        empreendimento_id: empreendimentoId ?? null,
        mensagem: mensagem ?? null,
        origem: 'corretor',
        status: 'novo',
        corretor_id: corretorId,
        atribuido_em: new Date().toISOString(),
      })
      .select(LEAD_SELECT)
      .single();
    if (error) throw error;
    return data;
  }

  /** Atualiza os dados de contato do lead. */
  async atualizarDados(id, { nome, email, telefone, mensagem, empreendimentoId }) {
    const campos = {};
    if (nome !== undefined) campos.nome = nome;
    if (email !== undefined) campos.email = email;
    if (telefone !== undefined) campos.telefone = telefone;
    if (mensagem !== undefined) campos.mensagem = mensagem;
    if (empreendimentoId !== undefined) campos.empreendimento_id = empreendimentoId;
    const { data, error } = await supabaseAdmin
      .from('leads').update(campos).eq('id', id).select(LEAD_SELECT).maybeSingle();
    if (error) throw error;
    return data;
  }

  /** Cliente, agendamento ou venda ligados ao lead (barram a exclusão). */
  async contarVinculos(id) {
    const contar = (tabela, coluna) =>
      supabaseAdmin.from(tabela).select('id', { count: 'exact', head: true }).eq(coluna, id);
    const respostas = await Promise.all([
      contar('clientes', 'lead_id'),
      contar('agendamentos', 'lead_id'),
      contar('agendamentos', 'lead_origem_id'),
    ]);
    const erro = respostas.find((r) => r.error);
    if (erro) throw erro.error;
    const [clientes, agLead, agOrigem] = respostas.map((r) => r.count ?? 0);
    return { clientes, agendamentos: agLead + agOrigem };
  }

  /** @param {string} id @returns {Promise<boolean>} */
  async excluir(id) {
    const { data, error } = await supabaseAdmin.from('leads').delete().eq('id', id).select('id');
    if (error) throw error;
    return (data ?? []).length > 0;
  }

  /** Primeiro lead com o mesmo telefone ou o mesmo e-mail (consultas separadas, sem montar filtro em texto). */
  async buscarPorContato({ email, telefone } = {}) {
    for (const [coluna, valor] of [['telefone', telefone], ['email', email]]) {
      if (!valor) continue;
      const { data, error } = await supabaseAdmin.from('leads').select('id').eq(coluna, valor).limit(1);
      if (error) throw error;
      if (data?.length) return data[0];
    }
    return null;
  }
}

module.exports = { LeadRepository };

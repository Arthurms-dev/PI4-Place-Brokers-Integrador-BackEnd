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
  /** A conversao completa ocorre em uma unica transacao no banco. */
  async converterLeadEmCliente(leadId) {
    const { data, error } = await supabaseAdmin.rpc('converter_lead_em_cliente', { p_lead_id: leadId });
    if (!error) return data;

    const { AppError } = require('../errors/AppError');
    if (error.code === 'P0001') {
      if (error.message === 'PB_LEAD_NOT_FOUND') {
        throw new AppError('NOT_FOUND', 'Lead não encontrado.', 404);
      }
      if (error.message === 'PB_LEAD_MISSING_OWNER') {
        throw new AppError('VALIDATION_ERROR', 'Atribua um corretor ao lead antes de converter em cliente.', 400, {
          corretor: 'Selecione um corretor responsável.',
        });
      }
      if (error.message === 'PB_LEAD_ALREADY_CONVERTED') {
        throw new AppError('CONFLICT', 'Este lead já foi convertido em cliente.', 409);
      }
      if (error.message === 'PB_LEAD_ALREADY_HAS_CLIENT') {
        throw new AppError('CONFLICT', 'Este lead já possui um cliente vinculado.', 409);
      }
    }
    if (error.code === '23505') {
      throw new AppError('CONFLICT', 'Este lead já possui um cliente vinculado.', 409);
    }
    if (error.code === '22P02') {
      throw new AppError('VALIDATION_ERROR', 'Identificador de lead inválido.', 400);
    }
    throw error;
  }

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

  /** @param {string} leadId @returns {Promise<object|null>} */
  async buscarPorLeadId(leadId) {
    const { data, error } = await supabaseAdmin
      .from('clientes')
      .select(CLIENTE_SELECT)
      .eq('lead_id', leadId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /**
   * Liga um cliente já existente ao lead de origem (só se ele ainda não tiver um).
   * @param {string} clienteId @param {string} leadId @returns {Promise<object|null>}
   */
  async vincularLead(clienteId, leadId) {
    const { data, error } = await supabaseAdmin
      .from('clientes')
      .update({ lead_id: leadId })
      .eq('id', clienteId)
      .is('lead_id', null)
      .select(CLIENTE_SELECT)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /**
   * Repasse de lead: o cliente ligado ao lead vai para a carteira do novo corretor.
   * Sem cliente ligado, ou já na carteira certa, não altera nada.
   * @param {string} leadId @param {string} corretorId @returns {Promise<number>} quantos mudaram
   */
  async moverDoLeadParaCorretor(leadId, corretorId) {
    const { data, error } = await supabaseAdmin
      .from('clientes')
      .update({ corretor_id: corretorId })
      .eq('lead_id', leadId)
      .neq('corretor_id', corretorId)
      .select('id');
    if (error) throw error;
    return (data ?? []).length;
  }

  /**
   * Venda pendente de algum cliente ligado ao lead, lançada por outro corretor que não `corretorId`.
   * Usada para barrar o repasse: a venda ficaria com quem lançou e o cliente com outro corretor.
   * @param {string} leadId @param {string} corretorId @returns {Promise<{ id: string, corretorNome: string|null }|null>}
   */
  async vendaPendenteDoLead(leadId, corretorId) {
    const { data: clientes, error } = await supabaseAdmin.from('clientes').select('id').eq('lead_id', leadId);
    if (error) throw error;
    const ids = (clientes ?? []).map((c) => c.id);
    if (!ids.length) return null;
    const { data: vendas, error: erroVenda } = await supabaseAdmin
      .from('vendas')
      .select('id, corretor_id')
      .in('cliente_id', ids)
      .eq('status', 'pendente')
      .neq('corretor_id', corretorId)
      .limit(1);
    if (erroVenda) throw erroVenda;
    const venda = (vendas ?? [])[0];
    if (!venda) return null;
    const { data: perfil } = await supabaseAdmin.from('profiles').select('nome').eq('id', venda.corretor_id).maybeSingle();
    return { id: venda.id, corretorNome: perfil?.nome ?? null };
  }

  /**
   * Repasse: visitas ainda por acontecer (agendadas ou confirmadas) dos clientes do lead vão para o
   * novo corretor. Visita que já passou, cancelada ou realizada fica com quem atendeu.
   * @param {string} leadId @param {string} corretorId @param {string} agoraIso @returns {Promise<number>} quantas mudaram
   */
  async moverVisitasFuturasDoLead(leadId, corretorId, agoraIso) {
    const { data: clientes, error } = await supabaseAdmin.from('clientes').select('id').eq('lead_id', leadId);
    if (error) throw error;
    const ids = (clientes ?? []).map((c) => c.id);
    if (!ids.length) return 0;
    const { data, error: erroAgenda } = await supabaseAdmin
      .from('agendamentos')
      .update({ corretor_id: corretorId })
      .in('cliente_id', ids)
      .in('status', ['agendado', 'confirmado'])
      .gte('data_hora', agoraIso)
      .neq('corretor_id', corretorId)
      .select('id');
    if (erroAgenda) throw erroAgenda;
    return (data ?? []).length;
  }

  /**
   * Cliente com o mesmo e-mail ou telefone (a mesma pessoa, mesmo que o nome seja outro).
   * @param {{ email?: string|null, telefone?: string|null, ignorarId?: string }} contato
   * @returns {Promise<object|null>}
   */
  async buscarPorContato({ email, telefone, ignorarId } = {}) {
    const filtros = [];
    const valor = (v) => `"${String(v).replace(/["\\]/g, '')}"`;
    if (email) filtros.push(`email.eq.${valor(email)}`);
    if (telefone) filtros.push(`telefone.eq.${valor(telefone)}`);
    if (!filtros.length) return null;
    let consulta = supabaseAdmin.from('clientes').select(CLIENTE_SELECT).or(filtros.join(','));
    if (ignorarId) consulta = consulta.neq('id', ignorarId);
    const { data, error } = await consulta.order('criado_em', { ascending: true }).limit(1);
    if (error) throw error;
    return data?.[0] ?? null;
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
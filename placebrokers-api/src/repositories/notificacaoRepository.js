'use strict';

const { supabaseAdmin } = require('../config/supabase');

const CAMPOS_AVISO = 'id, nome, telefone, email, mensagem, origem, status, corretor_id, atribuido_em, empreendimento:empreendimentos(nome), corretor:profiles!leads_corretor_id_fkey(nome, email, aviso_lead_email)';

class NotificacaoRepository {
  /** Web Push: { endpoint, p256dh, auth }. App (Expo): { endpoint: token do Expo, tipo: 'expo' }. */
  async salvarInscricao(usuarioId, { endpoint, p256dh = null, auth = null, tipo = 'web' }) {
    const { error } = await supabaseAdmin
      .from('push_inscricoes')
      .upsert({ usuario_id: usuarioId, endpoint, p256dh, auth, tipo }, { onConflict: 'endpoint' });
    if (error) throw error;
  }

  async removerInscricao(usuarioId, endpoint) {
    const { error } = await supabaseAdmin.from('push_inscricoes').delete().eq('usuario_id', usuarioId).eq('endpoint', endpoint);
    if (error) throw error;
  }

  /** Inscrição que o serviço de push diz não existir mais (celular trocado, permissão retirada). */
  async removerPorEndpoint(endpoint) {
    const { error } = await supabaseAdmin.from('push_inscricoes').delete().eq('endpoint', endpoint);
    if (error) throw error;
  }

  async inscricoesDe(usuarioId) {
    const { data, error } = await supabaseAdmin.from('push_inscricoes').select('endpoint, p256dh, auth, tipo').eq('usuario_id', usuarioId);
    if (error) throw error;
    return data ?? [];
  }

  async marcarEnvio(endpoint) {
    await supabaseAdmin.from('push_inscricoes').update({ ultimo_envio_em: new Date().toISOString() }).eq('endpoint', endpoint);
  }

  /**
   * Leads que chegaram a um corretor (roleta ou repasse) e ainda não geraram aviso.
   * Vale qualquer status menos "perdido": o lead pode ser convertido ou entrar em atendimento
   * segundos depois da atribuição, antes da verificação (a cada 30 s) passar por ele.
   */
  async leadsParaAvisar(desdeIso) {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .select(CAMPOS_AVISO)
      .is('notificado_em', null)
      .not('corretor_id', 'is', null)
      .neq('status', 'perdido')
      .gte('atribuido_em', desdeIso)
      .order('atribuido_em', { ascending: true })
      .limit(50);
    if (error) throw error;
    return data ?? [];
  }

  /** Um lead com os dados do aviso (cliente que voltou pelo site). */
  async leadParaAviso(leadId) {
    const { data, error } = await supabaseAdmin.from('leads').select(CAMPOS_AVISO).eq('id', leadId).maybeSingle();
    if (error) throw error;
    return data ?? null;
  }

  /**
   * Marca o lead como avisado e devolve o horário gravado (ou null se outro processo já marcou).
   * O horário serve para desfazer a reserva com liberarAviso se o aviso não chegar.
   */
  async reservarAviso(leadId) {
    const quando = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('leads')
      .update({ notificado_em: quando })
      .eq('id', leadId)
      .is('notificado_em', null)
      .select('id');
    if (error) throw error;
    return (data ?? []).length > 0 ? quando : null;
  }

  /** Desfaz a reserva, só se ela ainda for a mesma (não apaga o aviso de um repasse que veio depois). */
  async liberarAviso(leadId, reservadoEm) {
    const { error } = await supabaseAdmin
      .from('leads')
      .update({ notificado_em: null })
      .eq('id', leadId)
      .eq('notificado_em', reservadoEm);
    if (error) throw error;
  }
}

module.exports = { NotificacaoRepository };

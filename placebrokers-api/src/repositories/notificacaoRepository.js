'use strict';

const { supabaseAdmin } = require('../config/supabase');

class NotificacaoRepository {
  async salvarInscricao(usuarioId, { endpoint, p256dh, auth }) {
    const { error } = await supabaseAdmin
      .from('push_inscricoes')
      .upsert({ usuario_id: usuarioId, endpoint, p256dh, auth }, { onConflict: 'endpoint' });
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
    const { data, error } = await supabaseAdmin.from('push_inscricoes').select('endpoint, p256dh, auth').eq('usuario_id', usuarioId);
    if (error) throw error;
    return data ?? [];
  }

  async marcarEnvio(endpoint) {
    await supabaseAdmin.from('push_inscricoes').update({ ultimo_envio_em: new Date().toISOString() }).eq('endpoint', endpoint);
  }

  /** Leads que chegaram a um corretor (roleta ou repasse) e ainda não geraram aviso. */
  async leadsParaAvisar(desdeIso) {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .select('id, nome, corretor_id, atribuido_em, empreendimento:empreendimentos(nome)')
      .is('notificado_em', null)
      .not('corretor_id', 'is', null)
      .eq('status', 'novo')
      .gte('atribuido_em', desdeIso)
      .order('atribuido_em', { ascending: true })
      .limit(50);
    if (error) throw error;
    return data ?? [];
  }

  /** Marca o lead como avisado; devolve false se outro processo já marcou (não avisa duas vezes). */
  async reservarAviso(leadId) {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .update({ notificado_em: new Date().toISOString() })
      .eq('id', leadId)
      .is('notificado_em', null)
      .select('id');
    if (error) throw error;
    return (data ?? []).length > 0;
  }
}

module.exports = { NotificacaoRepository };

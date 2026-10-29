'use strict';

const { supabaseAdmin } = require('../config/supabase');

/** Acesso às tabelas da roleta (só pelo back, com service_role). */
class RoletaRepository {
  async registrarChegada(corretorId, porId) {
    const { data, error } = await supabaseAdmin.rpc('roleta_registrar_chegada', {
      p_corretor: corretorId,
      p_por: porId ?? null,
    });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  }

  /** @returns {Promise<number>} quantos leads foram entregues */
  async distribuir() {
    const { data, error } = await supabaseAdmin.rpc('roleta_distribuir');
    if (error) throw error;
    return Number(data) || 0;
  }

  async listarChegadas(dia) {
    const { data, error } = await supabaseAdmin
      .from('roleta_chegadas')
      .select('corretor_id, chegou_em, ordem, apto, corretor:profiles!roleta_chegadas_corretor_id_fkey(id, nome)')
      .eq('dia', dia)
      .order('ordem', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async buscarChegada(dia, corretorId) {
    const { data, error } = await supabaseAdmin
      .from('roleta_chegadas')
      .select('corretor_id, chegou_em, ordem, apto')
      .eq('dia', dia)
      .eq('corretor_id', corretorId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async atualizarApto(dia, corretorId, apto) {
    const { data, error } = await supabaseAdmin
      .from('roleta_chegadas')
      .update({ apto })
      .eq('dia', dia)
      .eq('corretor_id', corretorId)
      .select('corretor_id, chegou_em, ordem, apto')
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async removerChegada(dia, corretorId) {
    const { data, error } = await supabaseAdmin
      .from('roleta_chegadas')
      .delete()
      .eq('dia', dia)
      .eq('corretor_id', corretorId)
      .select('corretor_id');
    if (error) throw error;
    return (data ?? []).length > 0;
  }

  async buscarDia(dia) {
    const { data, error } = await supabaseAdmin.from('roleta_dias').select('dia, iniciada_em, iniciada_por').eq('dia', dia).maybeSingle();
    if (error) throw error;
    return data;
  }

  async iniciarDia(dia, porId) {
    const { error } = await supabaseAdmin
      .from('roleta_dias')
      .upsert({ dia, iniciada_por: porId ?? null }, { onConflict: 'dia', ignoreDuplicates: true });
    if (error) throw error;
  }

  /** Leads novos sem corretor (os mesmos 7 dias que a roleta considera). */
  async listarAguardando(desdeIso) {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .select('id, nome, origem, criado_em, empreendimento:empreendimentos(id, nome)')
      .is('corretor_id', null)
      .eq('status', 'novo')
      .gte('criado_em', desdeIso)
      .order('criado_em', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  /** corretor_id de cada lead entregue pela roleta no dia. */
  async entreguesNoDia(dia) {
    const { data, error } = await supabaseAdmin.from('leads').select('corretor_id').eq('roleta_dia', dia);
    if (error) throw error;
    return data ?? [];
  }

  async listarCorretoresAtivos() {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, nome, equipe_id')
      .eq('cargo', 'corretor')
      .eq('status', 'aprovado')
      .eq('ativo', true)
      .order('nome', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  // ---- Focos ----

  async listarFocos(corretorIds) {
    if (!corretorIds.length) return [];
    const { data, error } = await supabaseAdmin
      .from('corretor_focos')
      .select('corretor_id, empreendimento_id')
      .in('corretor_id', corretorIds);
    if (error) throw error;
    return data ?? [];
  }

  /** Troca a lista de focos do corretor pela informada. */
  async substituirFocos(corretorId, empreendimentoIds, porId) {
    let apagar = supabaseAdmin.from('corretor_focos').delete().eq('corretor_id', corretorId);
    if (empreendimentoIds.length) apagar = apagar.not('empreendimento_id', 'in', `(${empreendimentoIds.join(',')})`);
    const { error: erroApagar } = await apagar;
    if (erroApagar) throw erroApagar;
    if (!empreendimentoIds.length) return;
    const { error } = await supabaseAdmin
      .from('corretor_focos')
      .upsert(
        empreendimentoIds.map((id) => ({ corretor_id: corretorId, empreendimento_id: id, definido_por: porId ?? null })),
        { onConflict: 'corretor_id,empreendimento_id', ignoreDuplicates: true },
      );
    if (error) throw error;
  }

  async listarEmpreendimentos() {
    const { data, error } = await supabaseAdmin
      .from('empreendimentos')
      .select('id, nome, segmento, bairro, cidade, publicado')
      .order('nome', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }
}

module.exports = { RoletaRepository };

'use strict';

const { supabaseAdmin } = require ('../config/supabase');

const desde = (janelaMin) => new Date(Date.now() - janelaMin * 60 * 1000 ).toISOString();

class SegurancaRepository { 
    async registrarEvento ({ tipo, chave, detalhe = null }){
        const { error } = await supabaseAdmin.from('eventos_seguranca').insert({ tipo, chave, detalhe });
        if (error ) throw error;
    
    }

    async contarEventos ({tipo, chave, janelaMin}){
        const { count, error } = await supabaseAdmin
        .from('eventos_seguranca')
        .select('id', { count: 'exact', head: true})
        .eq('tipo', tipo)
        .eq('chave', chave)
        .gte('criado_em', desde(janelaMin));
        if (error) throw error;
        return count ?? 0;
    
    }
    async detalhesRecentes ({tipo, chave, janelaMin, limite = 200}) {
        const { data, error} = await supabaseAdmin
        .from('eventos_seguranca')
        .select('detalhe')
        .eq('tipo', tipo)
      .eq('chave', chave)
      .gte('criado_em', desde(janelaMin))
      .limit(limite);
    if (error) throw error;
    return data ?? [];
    }

    async existeAvisoRecente(chave, janelaMin){
        const { data, error }= await supabaseAdmin
        .from ('avisos_seguranca')
        .select('id') 
        .eq('chave', chave)
        .gte('criado_em', desde(janelaMin))
        .limit(1);
        if (error) throw error;
        return (data ?? []).length > 0;
    } 
}

module.exports = { SegurancaRepository};



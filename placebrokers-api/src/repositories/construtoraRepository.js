'use strict';

const { supabaseAdmin } = require('../config/supabase');

class ConstrutoraRepository {
  async listar() {
    const { data, error } = await supabaseAdmin.from('construtoras').select('*').order('nome');
    if (error) throw error;
    return data;
  }

  /** @param {{ nome: string, logoUrl?: string, site?: string }} dados */
  async criar({ nome, logoUrl, site }) {
    const { data, error } = await supabaseAdmin
      .from('construtoras')
      .insert({ nome, logo_url: logoUrl ?? null, site: site ?? null })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}

module.exports = { ConstrutoraRepository };
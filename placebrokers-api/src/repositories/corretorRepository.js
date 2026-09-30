'use strict';

const { supabaseAdmin } = require('../config/supabase');

class CorretorRepository {
  /** @returns {Promise<{ id: string, nome: string }[]>} */
  async listar() {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, nome')
      .in('cargo', ['corretor', 'admin'])
      .eq('ativo', true)
      .order('nome', { ascending: true });
    if (error) throw error;
    return data;
  }
}

module.exports = { CorretorRepository };
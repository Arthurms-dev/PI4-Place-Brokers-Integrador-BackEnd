'use strict';

const { supabaseAdmin } = require('../config/supabase');

class CorretorRepository {
  /** @returns {Promise<{ id: string, nome: string, email: string, cargo: string }[]>} */
  async listar() {
    // E-mail e cargo ajudam a separar nomes iguais nas listas (ex.: dois "Bruno").
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, nome, email, cargo')
      .in('cargo', ['corretor', 'admin'])
      .eq('ativo', true)
      .eq('status', 'aprovado')
      .order('nome', { ascending: true });
    if (error) throw error;
    return data;
  }
}

module.exports = { CorretorRepository };
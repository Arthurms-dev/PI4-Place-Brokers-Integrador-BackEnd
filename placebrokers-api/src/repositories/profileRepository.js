'use strict';

const { supabaseAdmin } = require('../config/supabase');

class ProfileRepository {
  /** @param {string} id @returns {Promise<object|null>} */
  async findById(id) {
    const { data, error } = await supabaseAdmin.from('profiles').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }

  /**
   * @param {{ id: string, nome: string, email: string, cargo: string }} profile
   * @returns {Promise<object>}
   */
  async create({ id, nome, email, cargo }) {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .insert({ id, nome, email, cargo })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}

module.exports = { ProfileRepository };

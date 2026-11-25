'use strict';

const { supabaseAuth, supabaseAdmin } = require('../config/supabase');

const { createClient } = require('@supabase/supabase-js');

const clienteAvulso = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const authClient = {
  /** @param {string} refreshToken */
  renovarSessao: (refreshToken) => clienteAvulso().auth.refreshSession({ refresh_token: refreshToken }),

  /** @param {{ email: string, password: string }} credentials */
  signInWithPassword: (credentials) => supabaseAuth.auth.signInWithPassword(credentials),

  /** @param {{ email: string, password: string }} payload */
  createUser: (payload) => supabaseAdmin.auth.admin.createUser({ ...payload, email_confirm: true }),

  /**
   * @param {string} token
   */
  encerrarSessao: (token) => supabaseAdmin.auth.admin.signOut(token, 'local'),
};

module.exports = { authClient };

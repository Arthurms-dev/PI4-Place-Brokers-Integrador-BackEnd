'use strict';

const { supabaseAuth, supabaseAdmin } = require('../config/supabase');

const { createClient } = require('@supabase/supabase-js');

// Cliente descartável: a sessão renovada não fica guardada no cliente compartilhado.
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
};

module.exports = { authClient };
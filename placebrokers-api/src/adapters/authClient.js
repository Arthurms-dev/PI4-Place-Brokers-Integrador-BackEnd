'use strict';

const { supabaseAuth, supabaseAdmin } = require('../config/supabase');

const authClient = {
  /** @param {{ email: string, password: string }} credentials */
  signInWithPassword: (credentials) => supabaseAuth.auth.signInWithPassword(credentials),

  
   /** @param {{ email: string, password: string }} payload */
   
  createUser: (payload) => supabaseAdmin.auth.admin.createUser({ ...payload, email_confirm: true }),
};

module.exports = { authClient };
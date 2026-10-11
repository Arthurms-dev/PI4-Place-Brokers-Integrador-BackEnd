'use strict';

const { supabaseAdmin } = require('../config/supabase');

async function updatePassword(userId, password) {
  return supabaseAdmin.auth.admin.updateUserById(userId, { password });
}

module.exports = { passwordClient: { updatePassword } };
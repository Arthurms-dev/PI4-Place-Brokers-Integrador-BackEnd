'use strict';

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const url = process.env.SUPABASE_URL;

const supabaseAuth = createClient(url, process.env.SUPABASE_ANON_KEY);

const supabaseAdmin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

module.exports = { supabaseAuth, supabaseAdmin };

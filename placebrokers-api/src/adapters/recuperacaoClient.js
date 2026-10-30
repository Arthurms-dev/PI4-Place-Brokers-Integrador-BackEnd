'use strict';

// Recuperação de senha usando o Supabase Auth.
// O back gera o link (sem o Supabase mandar e-mail) e depois confere o token que volta do site.

const { createClient } = require('@supabase/supabase-js');
const { supabaseAdmin } = require('../config/supabase');

// Cliente descartável para conferir o token: não mistura a sessão do usuário
// com o cliente compartilhado usado no login.
const clienteAvulso = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const recuperacaoClient = {
  /** Gera o token de recuperação. Devolve só o hash, que vai no link do e-mail. */
  async gerarToken(email) {
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email });
    if (error) throw error;
    const token = data?.properties?.hashed_token;
    if (!token) throw new Error('O Supabase não devolveu o token de recuperação.');
    return token;
  },

  /** Confere o token (vale uma vez só). Devolve { id, email, accessToken } ou null se não valer. */
  async conferirToken(tokenHash) {
    const { data, error } = await clienteAvulso().auth.verifyOtp({ type: 'recovery', token_hash: tokenHash });
    if (error || !data?.user) return null;
    return { id: data.user.id, email: data.user.email, accessToken: data.session?.access_token ?? null };
  },

  async trocarSenha(userId, senha) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: senha });
    if (error) throw error;
  },

  /** Derruba as outras sessões do usuário (quem tinha a senha antiga perde o acesso). */
  async encerrarSessoes(accessToken) {
    if (!accessToken) return;
    const { error } = await supabaseAdmin.auth.admin.signOut(accessToken, 'global');
    if (error) throw error;
  },
};

module.exports = { recuperacaoClient };

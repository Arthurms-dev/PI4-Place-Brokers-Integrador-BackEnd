'use strict';

const { supabaseAuth } = require('../config/supabase');

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ code: 'UNAUTHENTICATED', message: 'Token ausente.' });
  }

  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ code: 'UNAUTHENTICATED', message: 'Sessão inválida ou expirada.' });
  }

  req.userId = data.user.id;
  next();
}

module.exports = { authMiddleware };
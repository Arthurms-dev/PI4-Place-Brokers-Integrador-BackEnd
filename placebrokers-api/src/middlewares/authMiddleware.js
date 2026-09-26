'use strict';

const { supabaseAuth } = require('../config/supabase');
const { ProfileRepository } = require('../repositories/profileRepository');

const profileRepository = new ProfileRepository();

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

  const profile = await profileRepository.findById(data.user.id);
  if (!profile) {
    return res.status(401).json({ code: 'UNAUTHENTICATED', message: 'Perfil não encontrado.' });
  }

  req.userId = profile.id;
  req.user = profile;
  next();
}

module.exports = { authMiddleware };
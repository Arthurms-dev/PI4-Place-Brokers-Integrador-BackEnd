'use strict';

const { supabaseAuth } = require('../config/supabase');
const { ProfileRepository } = require('../repositories/profileRepository');

const profileRepository = new ProfileRepository();

async function optionalAuthMiddleware(req, res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    req.user = null;
    return next();
  }

  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data?.user) {
    req.user = null;
    return next();
  }

  const profile = await profileRepository.findById(data.user.id);
  req.user = profile && profile.ativo !== false && !['pendente', 'recusado'].includes(profile.status)
    ? profile
    : null;
  next();
}

module.exports = { optionalAuthMiddleware };
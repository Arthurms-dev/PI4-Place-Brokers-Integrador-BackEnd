
'use strict';

const { supabaseAuth } = require('../config/supabase');
const { ProfileRepository } = require('../repositories/profileRepository');

const profileRepository = new ProfileRepository();

const consultasPendentes = new Map();

function consultarSessao(token) {
  const existente = consultasPendentes.get(token);

  if (existente) {
    return existente;
  }

  const consulta = (async () => {
    const { data, error } = await supabaseAuth.auth.getUser(token);

    if (error || !data?.user) {
      return {
        autenticado: false,
        profile: null,
      };
    }

    const profile = await profileRepository.findById(data.user.id);

    return {
      autenticado: true,
      profile,
    };
  })();

  consultasPendentes.set(token, consulta);

  const limpar = () => {
    if (consultasPendentes.get(token) === consulta) {
      consultasPendentes.delete(token);
    }
  };

  consulta.then(limpar, limpar);

  return consulta;
}

module.exports = { consultarSessao };

'use strict';

const { supabaseAuth } = require('../config/supabase');
const { ProfileRepository } = require('../repositories/profileRepository');

const profileRepository = new ProfileRepository();

const TEMPO_CACHE_MS = Number(process.env.SESSAO_CACHE_MS ?? 20_000);
const MINUTO = 60 * 1000;

const consultasPendentes = new Map();
const cacheDeSessoes = new Map(); 

const faxina = setInterval(() => {
  const agora = Date.now();
  for (const [token, entrada] of cacheDeSessoes) {
    if (agora >= entrada.expiraEm) cacheDeSessoes.delete(token);
  }
}, Math.max(TEMPO_CACHE_MS, MINUTO));
faxina.unref?.();

function consultarSessao(token) {
  const emCache = cacheDeSessoes.get(token);
  if (emCache && Date.now() < emCache.expiraEm) {
    return Promise.resolve(emCache.resultado);
  }

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

  consulta.then(
    (resultado) => {
      limpar();
      if (resultado.autenticado) {
        cacheDeSessoes.set(token, { resultado, expiraEm: Date.now() + TEMPO_CACHE_MS });
      }
    },
    limpar
  );

  return consulta;
}

function invalidarSessao(token) {
  cacheDeSessoes.delete(token);
  consultasPendentes.delete(token);
}

module.exports = { consultarSessao, invalidarSessao, TEMPO_CACHE_MS };
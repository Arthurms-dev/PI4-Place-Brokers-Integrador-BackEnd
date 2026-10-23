
'use strict';

const { consultarSessao } = require('./consultarSessao');

async function optionalAuthMiddleware(req, res, next) {
  const header = req.headers.authorization ?? '';

  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : null;

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const { autenticado, profile } = await consultarSessao(token);

    req.user =
      autenticado &&
      profile &&
      profile.ativo !== false &&
      !['pendente', 'recusado'].includes(profile.status)
        ? profile
        : null;

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { optionalAuthMiddleware };

'use strict';

const { consultarSessao } = require('./consultarSessao');

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization ?? '';

  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({
      code: 'UNAUTHENTICATED',
      message: 'Token ausente.',
    });
  }

  try {
    const { autenticado, profile } = await consultarSessao(token);

    if (!autenticado) {
      return res.status(401).json({
        code: 'UNAUTHENTICATED',
        message: 'Sessão inválida ou expirada.',
      });
    }

    if (!profile) {
      return res.status(401).json({
        code: 'UNAUTHENTICATED',
        message: 'Perfil não encontrado.',
      });
    }

    if (
      profile.ativo === false ||
      ['pendente', 'recusado'].includes(profile.status)
    ) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Acesso não autorizado.',
      });
    }

    req.userId = profile.id;
    req.user = profile;

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { authMiddleware };

'use strict';

const { consultarSessao } = require('./consultarSessao');

// Com a senha temporária, só dá para ver o próprio perfil e trocar a senha.
const ROTAS_LIBERADAS_NA_TROCA = new Set(['GET /auth/me', 'PATCH /auth/senha']);

function rotaLiberadaNaTroca(req) {
  const caminho = `${req.baseUrl ?? ''}${req.path ?? ''}`.replace(/\/+$/, '');
  return ROTAS_LIBERADAS_NA_TROCA.has(`${req.method} ${caminho}`);
}

async function authMiddleware(req, res, next) {
  // Já conferida nesta requisição (modo AOS confere antes das rotas): não consulta de novo.
  if (req.sessaoConferida && req.user) return next();

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

    if (profile.trocar_senha === true && !rotaLiberadaNaTroca(req)) {
      return res.status(403).json({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Troque a senha temporária para continuar.',
      });
    }

    req.userId = profile.id;
    req.user = profile;
    req.sessaoConferida = true;

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { authMiddleware, rotaLiberadaNaTroca };

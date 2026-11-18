'use strict';

const { AuthService } = require('../services/authService');
const { ProfileRepository } = require('../repositories/profileRepository');
const { LoginAttemptRepository } = require('../repositories/loginAttemptRepository');
const { PainelAdmRepository } = require('../repositories/painelAdmRepository');
const { authClient } = require('../adapters/authClient');
const { passwordClient } = require('../adapters/passwordclient');
const { senhasVazadasClient } = require('../adapters/senhasVazadasClient');
const { AuthError } = require('../errors/AuthError');
const { RedefinicaoSenhaService } = require('../services/redefinicaoSenhaService');
const { recuperacaoClient } = require('../adapters/recuperacaoClient');
const { emailClient } = require('../adapters/emailClient');
const { vigia } = require('../services/avisosSeguranca');
const { AppError } = require('../errors/AppError');
const { invalidarSessao } = require('../middlewares/consultarSessao');

const profileRepository = new ProfileRepository();

const authService = new AuthService({
  authClient,
  profileRepository,
  passwordClient,
  loginAttemptRepository: new LoginAttemptRepository(),
  painelAdmRepository: new PainelAdmRepository(),
  vigia,
  senhasVazadas: senhasVazadasClient,
});

const redefinicaoSenha = new RedefinicaoSenhaService({
  profileRepository,
  recuperacao: recuperacaoClient,
  email: emailClient,
  painelAdmRepository: new PainelAdmRepository(),
  senhasVazadas: senhasVazadasClient,
});

async function login(req, res) {
  try {
    const result = await authService.login(req.body);

    return res.status(200).json(result);
  } catch (err) {
    return handleAuthError(res, err);
  }
}

async function register(req, res) {
  try {
    const result = await authService.register(req.body);

    return res.status(201).json(result);
  } catch (err) {
    return handleAuthError(res, err);
  }
}

async function me(req, res) {
  try {
    const profile = req.user;

    if (!profile) {
      return res.status(404).json({
        code: 'NOT_FOUND',
        message: 'Perfil não encontrado.',
      });
    }

    return res.status(200).json({
      user: {
        id: profile.id,
        nome: profile.nome,
        email: profile.email,
        role: profile.cargo,
        avisoLeadEmail: Boolean(profile.aviso_lead_email),
        avatarUrl: profile.avatar_url ?? null,
      },
    });
  } catch (err) {
    return handleAuthError(res, err);
  }
}

// Depois de mudar o perfil, a próxima chamada de /auth/me já mostra o dado novo (sem esperar o cache).
function esquecerSessaoDaRequisicao(req) {
  const token = String(req.headers?.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (token) invalidarSessao(token);
}

async function atualizarMe(req, res) {
  try {
    const usuario = await authService.atualizarPerfil(
      req.userId,
      req.body
    );
    esquecerSessaoDaRequisicao(req);

    return res.status(200).json({
      user: usuario,
    });
  } catch (err) {
    return handleAuthError(res, err);
  }
}

async function alterarSenha(req, res) {
  try {
    const resultado = await authService.alterarSenha(
      req.userId,
      req.body
    );
    esquecerSessaoDaRequisicao(req);

    return res.status(200).json(resultado);
  } catch (err) {
    return handleAuthError(res, err);
  }
}

async function renovar(req, res) {
  try {
    return res.status(200).json(await authService.renovar(req.body));
  } catch (err) {
    return handleAuthError(res, err);
  }
}

async function esqueciSenha(req, res) {
  try {
    return res.status(200).json(await redefinicaoSenha.solicitar(req.body));
  } catch (err) {
    return handleAuthError(res, err);
  }
}

async function redefinirSenha(req, res) {
  try {
    return res.status(200).json(await redefinicaoSenha.redefinir(req.body));
  } catch (err) {
    return handleAuthError(res, err);
  }
}

async function trocarFoto(req, res) {
  try {
    const resultado = await fotoPerfilService().trocar(req.user, req.file);
    esquecerSessaoDaRequisicao(req);
    return res.status(200).json(resultado);
  } catch (err) {
    return responderErroFoto(res, err);
  }
}

async function removerFoto(req, res) {
  try {
    const resultado = await fotoPerfilService().remover(req.user);
    esquecerSessaoDaRequisicao(req);
    return res.status(200).json(resultado);
  } catch (err) {
    return responderErroFoto(res, err);
  }
}

let servicoFoto = null;
function fotoPerfilService() {
  if (!servicoFoto) {
    const { FotoPerfilService, storageSupabase } = require('../services/fotoPerfilService');
    const { ProfileRepository } = require('../repositories/profileRepository');
    servicoFoto = new FotoPerfilService({ storage: storageSupabase(), profileRepository: new ProfileRepository() });
  }
  return servicoFoto;
}

function responderErroFoto(res, err) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ code: err.code, message: err.message, fieldErrors: err.fieldErrors });
  }
  return handleAuthError(res, err);
}

function handleAuthError(res, err) {
  if (err instanceof AuthError) {
    return res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
      fieldErrors: err.fieldErrors,
    });
  }

  console.error(err);

  return res.status(500).json({
    code: 'SERVER_ERROR',
    message: 'Erro interno do servidor.',
  });
}

module.exports = {
  trocarFoto,
  removerFoto,
  login,
  register,
  me,
  atualizarMe,
  alterarSenha,
  esqueciSenha,
  redefinirSenha,
  renovar,
};

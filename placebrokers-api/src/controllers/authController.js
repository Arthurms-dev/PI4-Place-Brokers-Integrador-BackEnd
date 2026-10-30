'use strict';

const { AuthService } = require('../services/authService');
const { ProfileRepository } = require('../repositories/profileRepository');
const { LoginAttemptRepository } = require('../repositories/loginAttemptRepository');
const { PainelAdmRepository } = require('../repositories/painelAdmRepository');
const { authClient } = require('../adapters/authClient');
const { passwordClient } = require('../adapters/passwordclient');
const { AuthError } = require('../errors/AuthError');
const { RedefinicaoSenhaService } = require('../services/redefinicaoSenhaService');
const { recuperacaoClient } = require('../adapters/recuperacaoClient');
const { emailClient } = require('../adapters/emailClient');

const profileRepository = new ProfileRepository();

const authService = new AuthService({
  authClient,
  profileRepository,
  passwordClient,
  loginAttemptRepository: new LoginAttemptRepository(),
  painelAdmRepository: new PainelAdmRepository(),

});

const redefinicaoSenha = new RedefinicaoSenhaService({
  profileRepository,
  recuperacao: recuperacaoClient,
  email: emailClient,
  painelAdmRepository: new PainelAdmRepository(),
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
      },
    });
  } catch (err) {
    return handleAuthError(res, err);
  }
}

async function atualizarMe(req, res) {
  try {
    const usuario = await authService.atualizarPerfil(
      req.userId,
      req.body
    );

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

    return res.status(200).json(resultado);
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
  login,
  register,
  me,
  atualizarMe,
  alterarSenha,
  esqueciSenha,
  redefinirSenha,
};

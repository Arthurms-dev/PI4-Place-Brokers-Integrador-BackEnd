'use strict';

const { AuthService } = require('../services/authService');
const { ProfileRepository } = require('../repositories/profileRepository');
const { authClient } = require('../adapters/authClient');
const { AuthError } = require('../errors/AuthError');

const authService = new AuthService({
  authClient,
  profileRepository: new ProfileRepository(),
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

function handleAuthError(res, err) {
  if (err instanceof AuthError) {
    return res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
      fieldErrors: err.fieldErrors,
    });
  }
  console.error(err); 
  return res.status(500).json({ code: 'SERVER_ERROR', message: 'Erro interno do servidor.' });
}

module.exports = { login, register };

'use strict';

const { EquipeService } = require('../services/equipeService');
const { EquipeRepository } = require('../repositories/equipeRepository');
const { ProfileRepository } = require('../repositories/profileRepository');
const { authClient } = require('../adapters/authClient');
const { AppError } = require('../errors/AppError');

const equipeService = new EquipeService({
  equipeRepository: new EquipeRepository(),
  profileRepository: new ProfileRepository(),
  authClient,
});

async function listar(req, res) {
  try {
    const { status, cargo } = req.query;
    return res.status(200).json(await equipeService.listar({ status, cargo }));
  } catch (err) {
    return handleError(res, err);
  }
}

async function atualizar(req, res) {
  try {
    return res.status(200).json(await equipeService.atualizar(req.params.id, req.body, req.user));
  } catch (err) {
    return handleError(res, err);
  }
}

async function criarGerente(req, res) {
  try {
    return res.status(201).json(await equipeService.criarGerente(req.body));
  } catch (err) {
    return handleError(res, err);
  }
}

async function listarTimes(req, res) {
  try {
    return res.status(200).json(await equipeService.listarTimes());
  } catch (err) {
    return handleError(res, err);
  }
}

async function criarTime(req, res) {
  try {
    return res.status(201).json(await equipeService.criarTime(req.body));
  } catch (err) {
    return handleError(res, err);
  }
}

async function atualizarTime(req, res) {
  try {
    return res.status(200).json(await equipeService.atualizarTime(req.params.id, req.body));
  } catch (err) {
    return handleError(res, err);
  }
}

async function removerTime(req, res) {
  try {
    await equipeService.removerTime(req.params.id);
    return res.status(204).send();
  } catch (err) {
    return handleError(res, err);
  }
}

async function listarDiretorias(req, res) {
  try {
    return res.status(200).json(await equipeService.listarDiretorias());
  } catch (err) {
    return handleError(res, err);
  }
}

async function criarDiretoria(req, res) {
  try {
    return res.status(201).json(await equipeService.criarDiretoria(req.body));
  } catch (err) {
    return handleError(res, err);
  }
}

function handleError(res, err) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ code: err.code, message: err.message, fieldErrors: err.fieldErrors });
  }
  console.error(err);
  return res.status(500).json({ code: 'SERVER_ERROR', message: 'Erro interno do servidor.' });
}

module.exports = {
  listar, atualizar, criarGerente,
  listarTimes, criarTime, atualizarTime, removerTime,
  listarDiretorias, criarDiretoria,
};
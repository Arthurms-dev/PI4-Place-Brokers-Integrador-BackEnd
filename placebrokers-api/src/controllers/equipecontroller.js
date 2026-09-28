'use strict';

const { EquipeService } = require('../services/equipeservice');
const { EquipeRepository } = require('../repositories/equiperepository');
const { AppError } = require('../errors/AppError');

const equipeService = new EquipeService({ equipeRepository: new EquipeRepository() });

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

function handleError(res, err) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ code: err.code, message: err.message, fieldErrors: err.fieldErrors });
  }
  console.error(err);
  return res.status(500).json({ code: 'SERVER_ERROR', message: 'Erro interno do servidor.' });
}

module.exports = { listar, atualizar };
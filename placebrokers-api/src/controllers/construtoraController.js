'use strict';

const { ConstrutoraService } = require('../services/construtoraService');
const { ConstrutoraRepository } = require('../repositories/construtoraRepository');
const { AppError } = require('../errors/AppError');

const construtoraService = new ConstrutoraService({ construtoraRepository: new ConstrutoraRepository() });

async function listar(req, res) {
  try {
    const dados = await construtoraService.listar();
    return res.status(200).json(dados);
  } catch (err) {
    return handleError(res, err);
  }
}

async function criar(req, res) {
  try {
    const dados = await construtoraService.criar(req.body);
    return res.status(201).json(dados);
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

module.exports = { listar, criar };
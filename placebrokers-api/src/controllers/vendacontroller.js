'use strict';

const { VendaService } = require('../services/vendaservice');
const { VendaRepository } = require('../repositories/vendaRepository');
const { EquipeRepository } = require('../repositories/equipeRepository');
const { AppError } = require('../errors/AppError');

const vendaService = new VendaService({
  vendaRepository: new VendaRepository(),
  equipeRepository: new EquipeRepository(),
});

async function criar(req, res) {
  try {
    return res.status(201).json(await vendaService.criar(req.body, req.user));
  } catch (err) {
    return handleError(res, err);
  }
}

async function listar(req, res) {
  try {
    return res.status(200).json(await vendaService.listar(req.user));
  } catch (err) {
    return handleError(res, err);
  }
}

async function decidir(req, res) {
  try {
    return res.status(200).json(await vendaService.decidir(req.params.id, req.body.status, req.user));
  } catch (err) {
    return handleError(res, err);
  }
}

async function vgv(req, res) {
  try {
    const { equipeId, diretoriaId } = req.query;
    return res.status(200).json(await vendaService.vgv(req.user, { equipeId, diretoriaId }));
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

module.exports = { criar, listar, decidir, vgv };
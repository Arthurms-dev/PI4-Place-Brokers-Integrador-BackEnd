'use strict';

const { MetricasService } = require('../services/metricasservice');
const { MetricasRepository } = require('../repositories/metricasrepository');
const { EquipeRepository } = require('../repositories/equipeRepository');
const { AppError } = require('../errors/AppError');

const metricasService = new MetricasService({
  metricasRepository: new MetricasRepository(),
  equipeRepository: new EquipeRepository(),
});

async function registrarEvento(req, res) {
  try {
    return res.status(202).json(await metricasService.registrarEvento(req.body, req.user));
  } catch (err) {
    return handleError(res, err);
  }
}

async function dashboard(req, res) {
  try {
    const { de, ate, equipeId, diretoriaId } = req.query;
    return res.status(200).json(await metricasService.dashboard({ de, ate, equipeId, diretoriaId }));
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

module.exports = { registrarEvento, dashboard };
'use strict';

// Instância única da roleta, usada pelas rotas /roleta e pela chegada de leads do site.
const { RoletaService } = require('./roletaService');
const { RoletaRepository } = require('../repositories/roletaRepository');
const { EquipeRepository } = require('../repositories/equiperepository');

const roletaService = new RoletaService({
  roletaRepository: new RoletaRepository(),
  equipeRepository: new EquipeRepository(),
});

module.exports = { roletaService };

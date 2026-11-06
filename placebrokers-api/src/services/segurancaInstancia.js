'use strict';

const { SegurancaService } = require ('../segurancaService');
const { SegurancaRepository } = require ('../repositories/segurancaRepository');
const { PainelAdmRepository } = require ('../repositories/painelAdmRepository');

const segurancaService = new SegurancaService ({
    segurancaRepository: new SegurancaRepository(),
    painelAdmRepository:  new PainelAdmRepository(),
});

module.exports = { segurancaService};
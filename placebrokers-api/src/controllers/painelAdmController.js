'use strict';

const { painelAdmService } = require('../services/painelAdmService');
const { painelAdmRepository } = require ('../repositories/painelAdmRepository');
const { AppError } = require('../errors/AppError');

const painelAdmService = new PainelService ({ painelAdmRepository: new painelAdmRepository() });

async function avisosSeguranca (req, res) {
    try {
        return res.status(200).json(await painelAdmService.listarAvisosSeguranca());
    } catch (err) {
        return handleError(res, err);
    }  
}

async function melhorias (req, res) {
    try {
        return res.status(200).json(await painelAdmService.listarMelhorias());
    } catch (err) {
        return handleError(res, err);
    }   
}

async function modificacoes (req, res) {
    try {
        return res.status(200).json (await painelAdmService.listarModificacoes());
    } catch (err) {
        return handleError(res, err);
    }  
}

function handleError(res, err){
    if (err instanceof AppError){
        return res.status(err.statusCode).json({ code: err.code, message: err.message, fieldErrors: err.fieldErrors });
    }
    console.error(err);
    return res.status(500).json({ code: 'SERVER_ERROR', message: 'Erro interno do servidor.' });
}

module.exports ={ avisosSeguranca, melhorias, modificacoes};
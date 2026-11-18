'use strict';

const { AppError } = require('../errors/AppError');
const { TrabalheConoscoService } = require('../services/trabalheConoscoService');
const { CandidaturaRepository } = require('../repositories/candidaturaRepository');

const service = new TrabalheConoscoService({ candidaturaRepository: new CandidaturaRepository() });

const responder = (fn, status = 200) => async (req, res) => {
  try {
    const resultado = await fn(req);
    return status === 204 ? res.status(204).end() : res.status(status).json(resultado);
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ code: err.code, message: err.message, fieldErrors: err.fieldErrors });
    }
    console.error(err);
    return res.status(500).json({ code: 'SERVER_ERROR', message: 'Erro interno do servidor.' });
  }
};

module.exports = {
  // Site público
  vagasAbertas: responder(async () => ({ vagas: await service.vagasAbertas() })),
  candidatar: responder(async (req) => ({ candidatura: await service.candidatar(req.body ?? {}, req.file) }), 201),

  // Painel do RH
  listarCandidaturas: responder(async (req) => {
    const { status, vagaId, area, unidade } = req.query;
    return { candidaturas: await service.listarCandidaturas({ status, vagaId, area, unidade }) };
  }),
  resumoCandidaturas: responder(async () => service.resumo()),
  atualizarCandidatura: responder(async (req) => ({ candidatura: await service.atualizarCandidatura(req.params.id, req.body ?? {}, req.user) })),
  removerCandidatura: responder(async (req) => service.removerCandidatura(req.params.id), 204),
  curriculo: responder(async (req) => service.linkCurriculo(req.params.id)),
  listarVagas: responder(async () => ({ vagas: await service.listarVagas() })),
  criarVaga: responder(async (req) => ({ vaga: await service.criarVaga(req.body ?? {}, req.user) }), 201),
  atualizarVaga: responder(async (req) => ({ vaga: await service.atualizarVaga(req.params.id, req.body ?? {}) })),
};

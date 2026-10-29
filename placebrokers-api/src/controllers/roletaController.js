'use strict';

const { AppError } = require('../errors/AppError');

function erro(res, e) {
  if (e instanceof AppError) {
    return res.status(e.statusCode).json({ code: e.code, message: e.message, fieldErrors: e.fieldErrors });
  }
  console.error(e);
  return res.status(500).json({ code: 'SERVER_ERROR', message: 'Erro interno no servidor.' });
}

/** @param {{ roletaService: import('../services/roletaService').RoletaService }} deps */
function criarRoletaController({ roletaService }) {
  const acao = (fn, status = 200) => async (req, res) => {
    try { return res.status(status).json(await fn(req)); } catch (e) { return erro(res, e); }
  };
  return {
    hoje: acao(() => roletaService.hoje()),
    marcarChegada: acao((req) => roletaService.marcarChegada(req.body?.corretorId, req.user), 201),
    definirApto: acao((req) => roletaService.definirApto(req.params.corretorId, req.body?.apto)),
    removerChegada: acao((req) => roletaService.removerChegada(req.params.corretorId)),
    iniciar: acao((req) => roletaService.iniciar(req.user)),
    distribuir: acao(() => roletaService.distribuir()),
    minha: acao((req) => roletaService.minha(req.user)),
    listarFocos: acao((req) => roletaService.listarFocos(req.user)),
    definirFocos: acao((req) => roletaService.definirFocos(req.user, req.params.corretorId, req.body?.empreendimentoIds)),
  };
}

module.exports = { criarRoletaController };

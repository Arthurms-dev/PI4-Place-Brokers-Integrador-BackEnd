'use strict';

const { AppError } = require('../errors/AppError');

class ViabilizadorController {
  /** @param {{ viabilizadorService: import('../services/viabilizadorService').ViabilizadorService }} deps */
  constructor({ viabilizadorService }) {
    this.viabilizadorService = viabilizadorService;
  }

  produtos = async (req, res) => {
    try {
      return res.status(200).json(await this.viabilizadorService.listarProdutos(req.user));
    } catch (error) {
      return this._handleError(res, error);
    }
  };

  atualizarProduto = async (req, res) => {
    try {
      return res.status(200).json({ produto: await this.viabilizadorService.atualizarProduto(req.params.id, req.body, req.user) });
    } catch (error) {
      return this._handleError(res, error);
    }
  };

  enviarDocumento = async (req, res) => {
    try {
      const produto = await this.viabilizadorService.enviarDocumento(req.params.id, req.params.tipo, req.file, req.user);
      return res.status(200).json({ produto });
    } catch (error) {
      return this._handleError(res, error);
    }
  };

  oportunidades = async (req, res) => {
    try {
      return res.status(200).json(await this.viabilizadorService.oportunidades(req.user, req.query.dias ?? 30));
    } catch (error) {
      return this._handleError(res, error);
    }
  };

  /** @private */
  _handleError(res, error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ code: error.code, message: error.message, fieldErrors: error.fieldErrors });
    }
    console.error(error);
    return res.status(500).json({ code: 'SERVER_ERROR', message: 'Erro interno do servidor.' });
  }
}

module.exports = { ViabilizadorController };
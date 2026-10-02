'use strict';

const { AppError } = require('../errors/AppError');

class LeadController {
  /** @param {{ leadService: import('../services/leadService').LeadService }} deps */
  constructor({ leadService }) {
    this.leadService = leadService;
  }

  criar = async (req, res) => {
    try {
      const lead = await this.leadService.criar(req.body ?? {});
      return res.status(201).json({ lead });
    } catch (error) {
      return this._handleError(res, error);
    }
  };

  listar = async (req, res) => {
    try {
      const leads = await this.leadService.listar();
      return res.status(200).json({ leads });
    } catch (error) {
      return this._handleError(res, error);
    }
  };

  listarMeus = async (req, res) => {
    try {
      const leads = await this.leadService.listarDoCorretor(req.user);
      return res.status(200).json({ leads });
    } catch (error) {
      return this._handleError(res, error);
    }
  };

  atualizarStatus = async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const lead = await this.leadService.atualizarStatus(id, status, req.user);
      return res.status(200).json({ lead });
    } catch (error) {
      return this._handleError(res, error);
    }
  };

  atribuirCorretor = async (req, res) => {
    try {
      const { id } = req.params;
      const { corretorId } = req.body;
      const lead = await this.leadService.atribuirCorretor(id, corretorId);
      return res.status(200).json({ lead });
    } catch (error) {
      return this._handleError(res, error);
    }
  };

  converter = async (req, res) => {
    try {
      const { id } = req.params;
      const resultado = await this.leadService.converterEmCliente(id);
      return res.status(201).json(resultado);
    } catch (error) {
      return this._handleError(res, error);
    }
  };

  /** @private */
  _handleError(res, error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        error: { code: error.code, message: error.message, fieldErrors: error.fieldErrors },
      });
    }
    console.error(error);
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Erro interno no servidor.' },
    });
  }
}

module.exports = { LeadController };
'use strict';

const { AppError } = require('../errors/AppError');

class ClienteController {
  /** @param {{ clienteService: import('../services/clienteService').ClienteService }} deps */
  constructor({ clienteService }) {
    this.clienteService = clienteService;
  }

  listar = async (req, res) => {
    try {
      const clientes = await this.clienteService.listar(req.user);
      return res.status(200).json({ clientes });
    } catch (error) {
      return this._handleError(res, error);
    }
  };

  criar = async (req, res) => {
    try {
      const { nome, email, telefone, observacoes, corretorId } = req.body;
      const cliente = await this.clienteService.criar({ nome, email, telefone, observacoes, corretorId }, req.user);
      return res.status(201).json({ cliente });
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
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno no servidor.' } });
  }
}

module.exports = { ClienteController };
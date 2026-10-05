'use strict';

const { AppError } = require('../errors/AppError');

class AgendamentoController {
  /** @param {{ agendamentoService: import('../services/agendamentoService').AgendamentoService }} deps */
  constructor({ agendamentoService }) {
    this.agendamentoService = agendamentoService;
  }

  listar = async (req, res) => {
    try {
      const agendamentos = await this.agendamentoService.listar();
      return res.status(200).json({ agendamentos });
    } catch (error) {
      return this._handleError(res, error);
    }
  };

  criar = async (req, res) => {
    try {
      const { tipo, dataHora, duracaoMinutos, clienteId, corretorId, empreendimentoId, local, observacoes, leadOrigemId } =
        req.body;
      const agendamento = await this.agendamentoService.criar({
        tipo,
        dataHora,
        duracaoMinutos,
        clienteId,
        corretorId,
        empreendimentoId,
        local,
        observacoes,
        leadOrigemId,
      });
      return res.status(201).json({ agendamento });
    } catch (error) {
      return this._handleError(res, error);
    }
  };

  remarcar = async (req, res) => {
    try {
      const { id } = req.params;
      const { dataHora } = req.body;
      const agendamento = await this.agendamentoService.remarcar(id, dataHora);
      return res.status(200).json({ agendamento });
    } catch (error) {
      return this._handleError(res, error);
    }
  };

  atualizarStatus = async (req, res) => {
    try {
      const { id } = req.params;
      const { status, motivoCancelamento, interesseAposVisita } = req.body;
      const agendamento = await this.agendamentoService.atualizarStatus(id, status, {
        motivoCancelamento,
        interesseAposVisita,
      });
      return res.status(200).json({ agendamento });
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

module.exports = { AgendamentoController };
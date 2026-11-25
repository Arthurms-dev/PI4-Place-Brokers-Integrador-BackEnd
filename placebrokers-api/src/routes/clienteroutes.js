'use strict';

const { Router } = require('express');
const { ClienteController } = require('../controllers/clientecontroller');
const { ClienteService } = require('../services/clienteservice');
const { ClienteRepository } = require('../repositories/clienteRepository');
const { AgendamentoService } = require('../services/agendamentoService');
const { AgendamentoRepository } = require('../repositories/agendamentoRepository');
const { AppError } = require('../errors/AppError');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireRole } = require('../middlewares/requireRole');

const clienteRepository = new ClienteRepository();
const clienteService = new ClienteService({ clienteRepository });
const clienteController = new ClienteController({ clienteService });
const agendamentoService = new AgendamentoService({ agendamentoRepository: new AgendamentoRepository() });

const router = Router();

router.use(authMiddleware, requireRole('admin', 'corretor'));

router.get('/', clienteController.listar);
router.get('/:id', clienteController.buscarPorId);
router.post('/', clienteController.criar);
router.patch('/:id', clienteController.atualizar);
router.delete('/:id', clienteController.excluir);

// Relacionamento cliente → agendamentos (URL composta).
// O cliente precisa ser da carteira de quem pede (o serviço devolve 403/404 se não for),
// e o agendamento precisa ser desse cliente.
function tratar(fn) {
  return async (req, res) => {
    try {
      return await fn(req, res);
    } catch (error) {
      return clienteController._handleError(res, error);
    }
  };
}

async function agendamentoDoCliente(req) {
  await clienteService.buscarPorId(req.params.id, req.user);
  const agendamento = await agendamentoService.buscarPorId(req.params.agendamentoId);
  if (agendamento.cliente?.id !== req.params.id) {
    throw new AppError('NOT_FOUND', 'Agendamento não encontrado para este cliente.', 404);
  }
  return agendamento;
}

router.get('/:id/agendamentos', tratar(async (req, res) => {
  await clienteService.buscarPorId(req.params.id, req.user);
  const agendamentos = await agendamentoService.listarPorCliente(req.params.id);
  return res.status(200).json({ agendamentos });
}));

router.post('/:id/agendamentos', tratar(async (req, res) => {
  const cliente = await clienteService.buscarPorId(req.params.id, req.user);
  const corpo = req.body ?? {};
  if (corpo.leadOrigemId && cliente.leadOrigem?.id !== corpo.leadOrigemId) {
    throw new AppError('VALIDATION_ERROR', 'Lead de origem não pertence ao cliente informado.', 400, {
      leadOrigemId: 'Selecione um lead vinculado a esse cliente.',
    });
  }
  const agendamento = await agendamentoService.criar({
    tipo: corpo.tipo,
    dataHora: corpo.dataHora,
    duracaoMinutos: corpo.duracaoMinutos,
    empreendimentoId: corpo.empreendimentoId,
    local: corpo.local,
    observacoes: corpo.observacoes,
    leadOrigemId: corpo.leadOrigemId,
    clienteId: req.params.id,
    // O responsável é sempre o dono do cliente (o corretor não escolhe).
    corretorId: cliente.corretor?.id ?? req.user.id,
  });
  return res.status(201).json({ agendamento });
}));

router.get('/:id/agendamentos/:agendamentoId', tratar(async (req, res) => {
  const agendamento = await agendamentoDoCliente(req);
  return res.status(200).json({ agendamento });
}));

router.patch('/:id/agendamentos/:agendamentoId', tratar(async (req, res) => {
  await agendamentoDoCliente(req);
  const agendamento = await agendamentoService.atualizar(req.params.agendamentoId, req.body ?? {});
  return res.status(200).json({ agendamento });
}));

router.delete('/:id/agendamentos/:agendamentoId', tratar(async (req, res) => {
  await agendamentoDoCliente(req);
  await agendamentoService.excluir(req.params.agendamentoId);
  return res.status(204).end();
}));

module.exports = router;

'use strict';

const { Router } = require('express');
const { AgendamentoController } = require('../controllers/agendamentoController');
const { AgendamentoService } = require('../services/agendamentoService');
const { AgendamentoRepository } = require('../repositories/agendamentoRepository');
const { ClienteRepository } = require('../repositories/clienteRepository');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireRole } = require('../middlewares/requireRole');

const agendamentoRepository = new AgendamentoRepository();
const clienteRepository = new ClienteRepository();
const agendamentoService = new AgendamentoService({ agendamentoRepository });
const agendamentoController = new AgendamentoController({ agendamentoService });

const router = Router();

router.use(authMiddleware, requireRole('admin', 'corretor'));

const ehAdmin = (req) => req.user.cargo === 'admin';

router.get('/', async (req, res) => {
  if (ehAdmin(req)) return agendamentoController.listar(req, res);
  try {
    // Não carregar no Back-end agendamentos de carteiras alheias.
    const agendamentos = await agendamentoService.listarPorCorretor(req.user.id);
    return res.status(200).json({ agendamentos });
  } catch (error) {
    return agendamentoController._handleError(res, error);
  }
});

async function validarCarteiraNaCriacao(req, res, next) {
  if (ehAdmin(req)) return next();
  // O corretor não escolhe o responsável pelo agendamento.
  req.body = { ...(req.body ?? {}), corretorId: req.user.id };
  if (!req.body.clienteId) return next(); // o serviço valida o campo obrigatório

  try {
    const cliente = await clienteRepository.buscarPorId(req.body.clienteId);
    if (!cliente || cliente.corretor?.id !== req.user.id) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Cliente não encontrado na sua carteira.' },
      });
    }
    // Impede associar a visita a um lead de outra pessoa/carteira.
    if (req.body.leadOrigemId && cliente.lead?.id !== req.body.leadOrigemId) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Lead de origem não pertence ao cliente informado.',
          fieldErrors: { leadOrigemId: 'Selecione um lead vinculado a esse cliente.' } },
      });
    }
    return next();
  } catch (error) {
    return agendamentoController._handleError(res, error);
  }
}

router.post('/', validarCarteiraNaCriacao, agendamentoController.criar);

async function exigirDono(req, res, next) {
  if (ehAdmin(req)) return next();
  try {
    const agendamento = await agendamentoRepository.buscarPorId(req.params.id);
    if (!agendamento) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Agendamento não encontrado.' } });
    }
    if (agendamento.corretor?.id !== req.user.id) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Este agendamento é de outro corretor.' } });
    }
    return next();
  } catch (error) {
    return agendamentoController._handleError(res, error);
  }
}

router.patch('/:id/data', exigirDono, agendamentoController.remarcar);
router.patch('/:id/status', exigirDono, agendamentoController.atualizarStatus);

module.exports = router;
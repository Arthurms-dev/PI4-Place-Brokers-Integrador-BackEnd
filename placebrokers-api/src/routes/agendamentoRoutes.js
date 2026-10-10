'use strict';

const { Router } = require('express');
const { AgendamentoController } = require('../controllers/agendamentoController');
const { AgendamentoService } = require('../services/agendamentoService');
const { AgendamentoRepository } = require('../repositories/agendamentoRepository');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireRole } = require('../middlewares/requireRole');

const agendamentoRepository = new AgendamentoRepository();
const agendamentoService = new AgendamentoService({ agendamentoRepository });
const agendamentoController = new AgendamentoController({ agendamentoService });

const router = Router();

router.use(authMiddleware, requireRole('admin', 'corretor'));

const ehAdmin = (req) => req.user.cargo === 'admin';

router.get('/', async (req, res) => {
  if (ehAdmin(req)) return agendamentoController.listar(req, res);
  try {
    const todos = await agendamentoService.listar();
    return res.status(200).json({ agendamentos: todos.filter((a) => a.corretor?.id === req.user.id) });
  } catch (error) {
    return agendamentoController._handleError(res, error);
  }
});

router.post(
  '/',
  (req, res, next) => {
    if (!ehAdmin(req)) req.body = { ...req.body, corretorId: req.user.id };
    next();
  },
  agendamentoController.criar,
);

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
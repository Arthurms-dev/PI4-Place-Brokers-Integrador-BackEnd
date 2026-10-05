'use strict';

const { Router } = require('express');
const { AgendamentoController } = require('../controllers/agendamentoController');
const { AgendamentoService } = require('../services/agendamentoService');
const { AgendamentoRepository } = require('../repositories/agendamentoRepository');

const agendamentoRepository = new AgendamentoRepository();
const agendamentoService = new AgendamentoService({ agendamentoRepository });
const agendamentoController = new AgendamentoController({ agendamentoService });

const router = Router();

router.get('/', agendamentoController.listar);
router.post('/', agendamentoController.criar);
router.patch('/:id/data', agendamentoController.remarcar);
router.patch('/:id/status', agendamentoController.atualizarStatus);

module.exports = router;
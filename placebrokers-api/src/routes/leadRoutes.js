'use strict';

const { Router } = require('express');
const { LeadController } = require('../controllers/leadController');
const { LeadService } = require('../services/leadService');
const { LeadRepository } = require('../repositories/leadRepository');
const { ClienteRepository } = require('../repositories/clienteRepository.js');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireRole } = require('../middlewares/requireRole');

const leadRepository = new LeadRepository();
const clienteRepository = new ClienteRepository();
const leadService = new LeadService({ leadRepository, clienteRepository });
const leadController = new LeadController({ leadService });

const router = Router();

router.post('/', leadController.criar);

router.get('/meus', authMiddleware, requireRole('corretor'), leadController.listarMeus);

router.patch('/:id/status', authMiddleware, requireRole('admin', 'corretor'), leadController.atualizarStatus);

router.get('/', authMiddleware, requireRole('admin'), leadController.listar);
router.patch('/:id/corretor', authMiddleware, requireRole('admin'), leadController.atribuirCorretor);
router.post('/:id/converter', authMiddleware, requireRole('admin'), leadController.converter);

module.exports = router;
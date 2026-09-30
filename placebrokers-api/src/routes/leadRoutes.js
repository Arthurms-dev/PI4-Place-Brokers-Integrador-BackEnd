'use strict';

const { Router } = require('express');
const { LeadController } = require('../controllers/leadController');
const { LeadService } = require('../services/leadService');
const { LeadRepository } = require('../repositories/leadRepository');
const { ClienteRepository } = require('../repositories/clienteRepository.js');

const leadRepository = new LeadRepository();
const clienteRepository = new ClienteRepository();
const leadService = new LeadService({ leadRepository, clienteRepository });
const leadController = new LeadController({ leadService });

const router = Router();

router.get('/', leadController.listar);
router.patch('/:id/status', leadController.atualizarStatus);
router.patch('/:id/corretor', leadController.atribuirCorretor);
router.post('/:id/converter', leadController.converter);

module.exports = router;
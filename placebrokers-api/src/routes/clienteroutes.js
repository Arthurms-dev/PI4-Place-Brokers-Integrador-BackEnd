'use strict';

const { Router } = require('express');
const { ClienteController } = require('../controllers/clientecontroller');
const { ClienteService } = require('../services/clienteservice');
const { ClienteRepository } = require('../repositories/clienteRepository');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireRole } = require('../middlewares/requireRole');

const clienteRepository = new ClienteRepository();
const clienteService = new ClienteService({ clienteRepository });
const clienteController = new ClienteController({ clienteService });

const router = Router();

router.use(authMiddleware, requireRole('admin', 'corretor'));

router.get('/', clienteController.listar);
router.post('/', clienteController.criar);

module.exports = router;
'use strict';

const { Router } = require('express');
const { CorretorController } = require('../controllers/corretorController');
const { CorretorRepository } = require('../repositories/corretorRepository');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireRole } = require('../middlewares/requireRole');

const corretorRepository = new CorretorRepository();
const corretorController = new CorretorController({ corretorRepository });

const router = Router();

// Listagem interna: nomes e IDs de colaboradores não são dados públicos.
router.get('/', authMiddleware, requireRole('admin'), corretorController.listar);

module.exports = router;
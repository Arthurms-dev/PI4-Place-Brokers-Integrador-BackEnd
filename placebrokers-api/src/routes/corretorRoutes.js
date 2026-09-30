'use strict';

const { Router } = require('express');
const { CorretorController } = require('../controllers/corretorController');
const { CorretorRepository } = require('../repositories/corretorRepository');

const corretorRepository = new CorretorRepository();
const corretorController = new CorretorController({ corretorRepository });

const router = Router();

router.get('/', corretorController.listar);

module.exports = router;
'use strict';

const { Router } = require('express');
const { registrarEvento, dashboard, meusAcessos, procura } = require('../controllers/metricascontroller');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { optionalAuthMiddleware } = require('../middlewares/optionalAuthMiddleware');
const { requireRole } = require('../middlewares/requireRole');
const { limitadores } = require('../middlewares/seguranca');

const router = Router();

router.post('/eventos', limitadores.eventos, optionalAuthMiddleware, registrarEvento);

// Público: quantas pessoas viram o empreendimento (agregado, com mínimo; nada de dado pessoal).
router.get('/procura/:empreendimentoId', limitadores.eventos, procura);

router.get('/meus-acessos', authMiddleware, meusAcessos);

// Diretor: o controller força a diretoria dele.
router.get('/dashboard', authMiddleware, requireRole('admin', 'diretor'), dashboard);

module.exports = router;

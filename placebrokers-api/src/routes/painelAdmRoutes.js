'use strict';

const { Router } = require('express');
const { avisosSeguranca, melhorias, criarMelhoria, modificacoes } = require('../controllers/painelAdmController');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireRole } = require('../middlewares/requireRole');

const router = Router();

router.use(authMiddleware, requireRole('admin'));

router.get('/avisos-seguranca', avisosSeguranca);
router.get('/melhorias', melhorias);
router.post('/melhorias', criarMelhoria);
router.get('/modificacoes', modificacoes);

module.exports = router;
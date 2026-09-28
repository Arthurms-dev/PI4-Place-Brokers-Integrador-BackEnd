'use strict';

const { Router } = require('express');
const { avisosSeguranca, melhorias, modificacoes } = require('../controllers/painelAdmController');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireRole } = require('../middlewares/requireRole');

const router = Router();

router.use(authMiddleware, requireRole('admin'));

router.get('/avisos-seguranca', avisosSeguranca);
router.get('/melhorias', melhorias);
router.get('/modificacoes', modificacoes);

module.exports = router;
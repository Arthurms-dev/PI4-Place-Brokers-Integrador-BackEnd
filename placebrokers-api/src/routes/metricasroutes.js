'use strict';

const { Router } = require('express');
const { registrarEvento, dashboard } = require('../controllers/metricascontroller');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { optionalAuthMiddleware } = require('../middlewares/optionalAuthMiddleware');
const { requireRole } = require('../middlewares/requireRole');
const { limitadores } = require('../middlewares/seguranca');

const router = Router();

router.post('/eventos', limitadores.eventos, optionalAuthMiddleware, registrarEvento);

router.get('/dashboard', authMiddleware, requireRole('admin'), dashboard);

module.exports = router;

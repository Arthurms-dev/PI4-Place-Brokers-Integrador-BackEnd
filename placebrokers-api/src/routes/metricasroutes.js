'use strict';

const { Router } = require('express');
const { registrarEvento, dashboard } = require('../controllers/metricascontroller');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { optionalAuthMiddleware } = require('../middlewares/optionalAuthMiddleware');
const { requireRole } = require('../middlewares/requireRole');

const router = Router();

router.post('/eventos', optionalAuthMiddleware, registrarEvento);

router.get('/dashboard', authMiddleware, requireRole('admin'), dashboard);

module.exports = router;
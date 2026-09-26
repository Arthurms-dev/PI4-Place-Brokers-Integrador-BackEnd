'use strict';

const { Router } = require('express');
const { listar, criar } = require('../controllers/construtoraController');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireRole } = require('../middlewares/requireRole');

const router = Router();

router.get('/', listar);
router.post('/', authMiddleware, requireRole('admin'), criar);

module.exports = router;
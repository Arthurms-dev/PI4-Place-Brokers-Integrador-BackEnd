'use strict';

const { Router } = require('express');
const { criar, listar, decidir, vgv } = require('../controllers/vendacontroller');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireRole } = require('../middlewares/requireRole');

const router = Router();

router.use(authMiddleware);

// Proteção por perfil no servidor, inclusive para chamadas diretas à API.
router.post('/', requireRole('corretor'), criar);
router.get('/', requireRole('admin', 'gerente', 'corretor'), listar);
router.patch('/:id', requireRole('admin', 'gerente'), decidir);
router.get('/vgv', requireRole('admin', 'gerente', 'corretor'), vgv);

module.exports = router;
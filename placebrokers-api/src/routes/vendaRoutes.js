'use strict';

const { Router } = require('express');
const { criar, listar, vgv, buscar, atualizar, excluir } = require('../controllers/vendacontroller');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireRole } = require('../middlewares/requireRole');

const router = Router();

router.use(authMiddleware);

// Proteção por perfil no servidor, inclusive para chamadas diretas à API.
router.post('/', requireRole('corretor'), criar);
router.get('/', requireRole('admin', 'gerente', 'corretor', 'diretor'), listar);
router.get('/vgv', requireRole('admin', 'gerente', 'corretor', 'diretor'), vgv);
// Depois de /vgv para o :id não engolir esse caminho.
router.get('/:id', requireRole('admin', 'gerente', 'corretor', 'diretor'), buscar);
// Gerente/admin: confirma ou recusa ({ status }). Corretor: corrige a própria venda pendente.
router.patch('/:id', requireRole('admin', 'gerente', 'corretor'), atualizar);
router.delete('/:id', requireRole('admin', 'corretor'), excluir);

module.exports = router;
'use strict';

const { Router } = require('express');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireRole } = require('../middlewares/requireRole');
const { criarRoletaController } = require('../controllers/roletaController');
const { roletaService } = require('../services/roletaInstancia');

const c = criarRoletaController({ roletaService });
const router = Router();

router.use(authMiddleware);

// Recepção (cargo próprio; o admin também pode): lista de chegada e distribuição.
router.get('/hoje', requireRole('admin', 'recepcao'), c.hoje);
router.post('/chegada', requireRole('admin', 'recepcao'), c.marcarChegada);
router.patch('/chegada/:corretorId', requireRole('admin', 'recepcao'), c.definirApto);
router.delete('/chegada/:corretorId', requireRole('admin', 'recepcao'), c.removerChegada);
router.post('/iniciar', requireRole('admin', 'recepcao'), c.iniciar);
router.post('/distribuir', requireRole('admin', 'recepcao'), c.distribuir);

// Corretor: sua posição de hoje.
router.get('/minha', requireRole('corretor'), c.minha);

// Focos: gerente na própria equipe, admin em todos.
router.get('/focos', requireRole('admin', 'gerente'), c.listarFocos);
router.put('/focos/:corretorId', requireRole('admin', 'gerente'), c.definirFocos);

module.exports = router;

'use strict';

const { Router } = require('express');
const c = require('../controllers/trabalheConoscoController');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireRole } = require('../middlewares/requireRole');

const router = Router();

// Painel do RH: login próprio (cargo rh). O admin também vê.
router.use(authMiddleware, requireRole('admin', 'rh'));

router.get('/candidaturas', c.listarCandidaturas);
router.get('/candidaturas/resumo', c.resumoCandidaturas);
router.patch('/candidaturas/:id', c.atualizarCandidatura);
router.delete('/candidaturas/:id', c.removerCandidatura);
router.get('/candidaturas/:id/curriculo', c.curriculo);

router.get('/vagas', c.listarVagas);
router.post('/vagas', c.criarVaga);
router.patch('/vagas/:id', c.atualizarVaga);

module.exports = router;

'use strict';

const { Router } = require('express');
const {
  listar, atualizar, criarGerente,
  listarTimes, criarTime, atualizarTime, removerTime,
  listarDiretorias, criarDiretoria,
} = require('../controllers/equipeController');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireRole } = require('../middlewares/requireRole');

const router = Router();

router.use(authMiddleware, requireRole('admin'));

router.get('/', listar);

router.patch('/:id', atualizar);
router.post('/gerentes', criarGerente);

router.get('/times', listarTimes);
router.post('/times', criarTime);
router.patch('/times/:id', atualizarTime);
router.delete('/times/:id', removerTime);

router.get('/diretorias', listarDiretorias);
router.post('/diretorias', criarDiretoria);

module.exports = router;
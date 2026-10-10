'use strict';

const { Router } = require('express');
const multer = require('multer');
const { listar, buscarPorId, criar, atualizar, documento } = require('../controllers/empreendimentoController');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { optionalAuthMiddleware } = require('../middlewares/optionalAuthMiddleware');
const { requireRole } = require('../middlewares/requireRole');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const router = Router();

router.get('/', optionalAuthMiddleware, listar);
router.get('/:id', optionalAuthMiddleware, buscarPorId);

router.get('/:id/documentos/:tipo', authMiddleware, documento);

router.post(
  '/',
  authMiddleware,
  requireRole('admin'),
  upload.fields([
    { name: 'capa', maxCount: 1 },
    { name: 'galeria', maxCount: 20 },
    { name: 'book', maxCount: 1 },
    { name: 'tabela', maxCount: 1 },
  ]),
  criar,
);

router.patch('/:id', authMiddleware, requireRole('admin'), atualizar);

module.exports = router;
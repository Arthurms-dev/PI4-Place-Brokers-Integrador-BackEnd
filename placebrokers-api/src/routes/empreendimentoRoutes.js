'use strict';

const { Router } = require('express');
const multer = require('multer');
const { listar, buscarPorId, criar, atualizar, documento } = require('../controllers/empreendimentoController');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { optionalAuthMiddleware } = require('../middlewares/optionalAuthMiddleware');
const { requireRole } = require('../middlewares/requireRole');
const { listar: listarDocsComerciais, abrir: abrirDocComercial } = require('../controllers/documentosEmpreendimentoController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const router = Router();

router.get('/', optionalAuthMiddleware, listar);
router.get('/:id', optionalAuthMiddleware, buscarPorId);

router.get('/:id/documentos', authMiddleware, requireRole('admin', 'corretor', 'gerente'), listarDocsComerciais);
router.get('/:id/documentos/arquivo/:docId', authMiddleware, requireRole('admin', 'corretor', 'gerente'), abrirDocComercial);
router.get('/:id/documentos/:tipo', authMiddleware, requireRole('admin', 'corretor', 'gerente'), documento);

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
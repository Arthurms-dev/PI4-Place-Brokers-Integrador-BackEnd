'use strict';

const { Router } = require('express');
const multer = require('multer');
const {
  listar,
  buscarPorId,
  criar,
  atualizar,
  documento,
  criarTipologia,
  atualizarTipologia,
  trocarCapa,
  adicionarFotos,
  removerFoto,
} = require('../controllers/empreendimentoController');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { optionalAuthMiddleware } = require('../middlewares/optionalAuthMiddleware');
const { requireRole } = require('../middlewares/requireRole');
const {
  listar: listarDocsComerciais,
  abrir: abrirDocComercial,
} = require('../controllers/documentosEmpreendimentoController');
const {
  listar: listarDocsAdmin,
  criar: criarDocAdmin,
  atualizar: atualizarDocAdmin,
} = require('../controllers/documentosEmpreendimentoAdminController');

const { listar: listarPendenciasDrive, revisar: revisarPendenciaDrive } = require('../controllers/pendenciasDriveController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});
const router = Router();

router.get('/documentos/pendencias', authMiddleware, requireRole('admin'), listarPendenciasDrive);
router.patch('/documentos/pendencias/:pendenciaId', authMiddleware, requireRole('admin'), revisarPendenciaDrive);
router.get('/', optionalAuthMiddleware, listar);
router.get('/:id', optionalAuthMiddleware, buscarPorId);

// A ordem evita tratar /documentos/admin como /documentos/:tipo.
router.get('/:id/documentos/admin', authMiddleware, requireRole('admin'), listarDocsAdmin);
router.post('/:id/documentos/admin', authMiddleware, requireRole('admin'), criarDocAdmin);
router.patch('/:id/documentos/admin/:docId', authMiddleware, requireRole('admin'), atualizarDocAdmin);

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
// Uploads protegidos: até 15 MB por foto, cinco fotos por envio.
router.post('/:id/imagens/capa', authMiddleware, requireRole('admin'), upload.single('imagem'), trocarCapa);
router.post('/:id/imagens/galeria', authMiddleware, requireRole('admin'), upload.array('imagens', 5), adicionarFotos);
router.delete('/:id/imagens/:imagemId', authMiddleware, requireRole('admin'), removerFoto);
router.post('/:id/tipologias', authMiddleware, requireRole('admin'), criarTipologia);
router.patch('/:id/tipologias/:tipologiaId', authMiddleware, requireRole('admin'), atualizarTipologia);
module.exports = router;

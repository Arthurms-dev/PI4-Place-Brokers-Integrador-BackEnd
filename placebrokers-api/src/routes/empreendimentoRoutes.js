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
const { vigia, emSegundoPlano } = require('../services/avisosSeguranca');

// Conta quantos books/tabelas cada usuário abre: muitos em pouco tempo vira aviso de segurança.
const vigiarDocumento = (req, res, next) => {
  emSegundoPlano(vigia.documentoAberto({ user: req.user }));
  next();
};
const {
  listar: listarDocsComerciais,
  abrir: abrirDocComercial,
} = require('../controllers/documentosEmpreendimentoController');
const {
  listar: listarDocsAdmin,
  criar: criarDocAdmin,
  atualizar: atualizarDocAdmin,
} = require('../controllers/documentosEmpreendimentoAdminController');

const { listar: listarPendenciasDrive } = require('../controllers/pendenciasDriveController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});
const router = Router();
// Quem mantém o catálogo: admin e o cargo de cadastro (empreendimentos, fotos, books e tabelas).
const CATALOGO = ['admin', 'cadastro'];

router.get('/documentos/pendencias', authMiddleware, requireRole(...CATALOGO), listarPendenciasDrive);
router.get('/', optionalAuthMiddleware, listar);
router.get('/:id', optionalAuthMiddleware, buscarPorId);

// A ordem evita tratar /documentos/admin como /documentos/:tipo.
router.get('/:id/documentos/admin', authMiddleware, requireRole(...CATALOGO), listarDocsAdmin);
router.post('/:id/documentos/admin', authMiddleware, requireRole(...CATALOGO), criarDocAdmin);
router.patch('/:id/documentos/admin/:docId', authMiddleware, requireRole(...CATALOGO), atualizarDocAdmin);

router.get('/:id/documentos', authMiddleware, requireRole('admin', 'corretor', 'gerente'), listarDocsComerciais);
router.get('/:id/documentos/arquivo/:docId', authMiddleware, requireRole('admin', 'corretor', 'gerente'), vigiarDocumento, abrirDocComercial);
router.get('/:id/documentos/:tipo', authMiddleware, requireRole('admin', 'corretor', 'gerente'), vigiarDocumento, documento);

router.post(
  '/',
  authMiddleware,
  requireRole(...CATALOGO),
  upload.fields([
    { name: 'capa', maxCount: 1 },
    { name: 'galeria', maxCount: 20 },
    { name: 'book', maxCount: 1 },
    { name: 'tabela', maxCount: 1 },
  ]),
  criar,
);
router.patch('/:id', authMiddleware, requireRole(...CATALOGO), atualizar);
// Uploads protegidos: até 15 MB por foto, cinco fotos por envio.
router.post('/:id/imagens/capa', authMiddleware, requireRole(...CATALOGO), upload.single('imagem'), trocarCapa);
router.post('/:id/imagens/galeria', authMiddleware, requireRole(...CATALOGO), upload.array('imagens', 5), adicionarFotos);
router.delete('/:id/imagens/:imagemId', authMiddleware, requireRole(...CATALOGO), removerFoto);
router.post('/:id/tipologias', authMiddleware, requireRole(...CATALOGO), criarTipologia);
router.patch('/:id/tipologias/:tipologiaId', authMiddleware, requireRole(...CATALOGO), atualizarTipologia);
module.exports = router;

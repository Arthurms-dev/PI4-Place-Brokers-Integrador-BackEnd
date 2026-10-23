'use strict';

const { Router } = require('express');
const multer = require('multer');
const { ViabilizadorController } = require('../controllers/viabilizadorcontroller');
const { ViabilizadorService } = require('../services/viabilizadorservice');
const { ViabilizadorRepository } = require('../repositories/viabilizadorrepository');
const { UploadService } = require('../services/uploadService');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireRole } = require('../middlewares/requireRole');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const viabilizadorService = new ViabilizadorService({
  viabilizadorRepository: new ViabilizadorRepository(),
  uploadService: new UploadService(),
});
const controller = new ViabilizadorController({ viabilizadorService });

const router = Router();

router.use(authMiddleware, requireRole('viabilizador'));

router.get('/produtos', controller.produtos);
router.patch('/produtos/:id', controller.atualizarProduto);
router.post('/produtos/:id/documentos/:tipo', upload.single('arquivo'), controller.enviarDocumento);
router.get('/oportunidades', controller.oportunidades);

module.exports = router;
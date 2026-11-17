'use strict';

const { Router } = require('express');
const multer = require('multer');
const { vagasAbertas, candidatar } = require('../controllers/trabalheConoscoController');
const { limitadores, antiSpamCandidatura } = require('../middlewares/seguranca');
const { TAMANHO_MAXIMO_CURRICULO } = require('../services/trabalheConoscoService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANHO_MAXIMO_CURRICULO, files: 1, fields: 20, fieldSize: 4 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype === 'application/pdf'),
});

// Erro do upload vira resposta clara (e não "arquivo passa de 15 MB", que é o limite das fotos).
function receberCurriculo(req, res, next) {
  upload.single('curriculo')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ code: 'FILE_TOO_LARGE', message: 'O currículo passa de 5 MB.', fieldErrors: { curriculo: 'Envie um PDF de até 5 MB.' } });
    }
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Não foi possível ler o formulário.', fieldErrors: { curriculo: 'Envie um PDF de até 5 MB.' } });
  });
}

const router = Router();

router.get('/vagas', vagasAbertas);
router.post('/candidaturas', limitadores.candidatura, receberCurriculo, antiSpamCandidatura, candidatar);

module.exports = router;

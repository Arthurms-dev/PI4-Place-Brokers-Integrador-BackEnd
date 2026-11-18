'use strict';

const { Router } = require('express');
const multer = require('multer');
const {
  login, register, me, atualizarMe, alterarSenha, esqueciSenha, redefinirSenha, renovar, trocarFoto, removerFoto,
} = require('../controllers/authController');
const { TAMANHO_MAXIMO_ENVIO } = require('../services/fotoPerfilService');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { limitadores } = require('../middlewares/seguranca');

const router = Router();

const uploadFoto = multer({ storage: multer.memoryStorage(), limits: { fileSize: TAMANHO_MAXIMO_ENVIO, files: 1, fields: 0 } });
function receberFoto(req, res, next) {
  uploadFoto.single('foto')(req, res, (err) => {
    if (!err) return next();
    const mensagem = err.code === 'LIMIT_FILE_SIZE' ? 'A foto passa de 5 MB.' : 'Não foi possível ler a foto.';
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ code: 'VALIDATION_ERROR', message: mensagem, fieldErrors: { foto: mensagem } });
  });
}

router.post('/login', limitadores.loginPorIp, limitadores.loginPorEmail, login);
router.post('/register', limitadores.cadastro, register);
router.post('/renovar', limitadores.renovacao, renovar);
router.get('/me', authMiddleware, me);
router.patch('/me', authMiddleware, atualizarMe);
// Foto de perfil: cada um troca a própria (o id vem do token, nunca do corpo).
router.put('/me/foto', authMiddleware, limitadores.fotoPerfil, receberFoto, trocarFoto);
router.delete('/me/foto', authMiddleware, removerFoto);
router.patch('/senha', authMiddleware, limitadores.trocaDeSenha, alterarSenha);
router.post('/esqueci-senha', limitadores.esqueciSenhaPorIp, limitadores.esqueciSenhaPorEmail, esqueciSenha);
router.post('/redefinir-senha', limitadores.redefinicaoSenha, redefinirSenha);

module.exports = router;

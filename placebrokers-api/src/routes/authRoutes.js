'use strict';

const { Router } = require('express');
const { login, register, me, atualizarMe, alterarSenha, esqueciSenha, redefinirSenha } = require('../controllers/authController');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { limitadores } = require('../middlewares/seguranca');

const router = Router();

router.post('/login', limitadores.loginPorIp, limitadores.loginPorEmail, login);
router.post('/register', limitadores.cadastro, register);
router.get('/me', authMiddleware, me);
router.patch('/me', authMiddleware, atualizarMe);
router.patch('/senha', authMiddleware, limitadores.trocaDeSenha, alterarSenha);
router.post('/esqueci-senha', limitadores.esqueciSenhaPorIp, limitadores.esqueciSenhaPorEmail, esqueciSenha);
router.post('/redefinir-senha', limitadores.redefinicaoSenha, redefinirSenha);

module.exports = router;
'use strict';

const { Router } = require('express');
const { login, register, me, atualizarMe, alterarSenha } = require('../controllers/authController');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = Router();

router.post('/login', login);
router.post('/register', register);
router.get('/me', authMiddleware, me);
router.patch('/me', authMiddleware, atualizarMe);
router.patch('/senha', authMiddleware, alterarSenha);

module.exports = router;
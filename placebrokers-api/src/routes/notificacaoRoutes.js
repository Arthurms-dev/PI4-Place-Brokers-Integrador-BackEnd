'use strict';

const { Router } = require('express');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { AppError } = require('../errors/AppError');
const { notificacoes } = require('../services/notificacaoService');

const router = Router();

function tratar(acao) {
  return async (req, res) => {
    try {
      return res.status(200).json(await acao(req));
    } catch (e) {
      if (e instanceof AppError) return res.status(e.statusCode).json({ code: e.code, message: e.message, fieldErrors: e.fieldErrors });
      console.error(e);
      return res.status(500).json({ code: 'SERVER_ERROR', message: 'Erro interno no servidor.' });
    }
  };
}

// A chave pública é pública mesmo (o navegador precisa dela para se inscrever).
router.get('/chave', tratar(async () => ({ chave: notificacoes().chavePublica() })));
router.post('/inscricao', authMiddleware, tratar((req) => notificacoes().inscrever(req.user, req.body)));
router.delete('/inscricao', authMiddleware, tratar((req) => notificacoes().cancelar(req.user, req.query.endpoint)));

module.exports = router;

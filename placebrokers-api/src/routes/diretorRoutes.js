'use strict';

const { Router } = require('express');
const { DiretorService } = require('../services/diretorService');
const { LeadService } = require('../services/leadService');
const { LeadRepository } = require('../repositories/leadRepository');
const { ClienteRepository } = require('../repositories/clienteRepository');
const { EquipeRepository } = require('../repositories/equiperepository');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireRole } = require('../middlewares/requireRole');

const leadRepository = new LeadRepository();
const diretorService = new DiretorService({
  equipeRepository: new EquipeRepository(),
  leadRepository,
  leadService: new LeadService({ leadRepository, clienteRepository: new ClienteRepository() }),
});

const router = Router();
router.use(authMiddleware, requireRole('diretor'));

function tratar(acao) {
  return async (req, res) => {
    try {
      return res.status(200).json(await acao(req));
    } catch (error) {
      if (error?.statusCode && error.statusCode < 500) {
        return res.status(error.statusCode).json({ code: error.code, message: error.message, fieldErrors: error.fieldErrors });
      }
      console.error(error);
      return res.status(500).json({ code: 'SERVER_ERROR', message: 'Erro interno do servidor.' });
    }
  };
}

// Equipes, gerentes e corretores da diretoria do diretor logado (nunca de outra).
router.get('/diretoria', tratar((req) => diretorService.contexto(req.user)));
router.get('/leads', tratar(async (req) => ({ leads: await diretorService.leads(req.user) })));
router.patch('/leads/:id/corretor', tratar(async (req) => ({
  lead: await diretorService.repassar(req.user, req.params.id, req.body?.corretorId),
})));

module.exports = router;

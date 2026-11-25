'use strict';

const { Router } = require('express');
const { LeadController } = require('../controllers/leadController');
const { LeadService } = require('../services/leadService');
const { LeadRepository } = require('../repositories/leadRepository');
const { ClienteRepository } = require('../repositories/clienteRepository.js');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireRole } = require('../middlewares/requireRole');
const leadAtividadeController = require('../controllers/leadAtividadeController');
const { limitadores, antiSpamLead } = require('../middlewares/seguranca');
const { roletaService } = require('../services/roletaInstancia');
const { notificacoes } = require('../services/notificacaoService');

const leadRepository = new LeadRepository();
const clienteRepository = new ClienteRepository();
// O serviço de avisos só é criado na primeira vez que um cliente volta pelo site.
const avisos = { avisarClienteVoltou: (leadId) => notificacoes().avisarClienteVoltou(leadId) };
const leadService = new LeadService({ leadRepository, clienteRepository, roleta: roletaService, avisos });
const leadController = new LeadController({ leadService });

const router = Router();

router.post('/', limitadores.leadPublico, antiSpamLead, leadController.criar);

router.get('/:id/atividades', authMiddleware, requireRole('admin', 'corretor'), leadAtividadeController.listar);
router.post('/:id/atividades', authMiddleware, requireRole('admin', 'corretor'), leadAtividadeController.registrar);

router.get('/:id/atividades/:atividadeId', authMiddleware, requireRole('admin', 'corretor'), leadAtividadeController.buscar);
router.patch('/:id/atividades/:atividadeId', authMiddleware, requireRole('admin', 'corretor'), leadAtividadeController.atualizar);
router.delete('/:id/atividades/:atividadeId', authMiddleware, requireRole('admin', 'corretor'), leadAtividadeController.excluir);

router.get('/meus', authMiddleware, requireRole('corretor'), leadController.listarMeus);
router.post('/meus', authMiddleware, requireRole('corretor'), leadController.criarDoCorretor);
router.get('/retornos', authMiddleware, requireRole('corretor'), leadAtividadeController.retornos);
router.post('/:id/cliente', authMiddleware, requireRole('admin', 'corretor'), leadController.garantirCliente);
router.patch('/:id/status', authMiddleware, requireRole('admin', 'corretor'), leadController.atualizarStatus);

router.get('/', authMiddleware, requireRole('admin'), leadController.listar);
router.patch('/:id/corretor', authMiddleware, requireRole('admin'), leadController.atribuirCorretor);
router.post('/:id/converter', authMiddleware, requireRole('admin'), leadController.converter);

// Depois das rotas fixas (/meus, /retornos) para o :id não engolir esses caminhos.
router.get('/:id', authMiddleware, requireRole('admin', 'corretor'), leadController.buscarPorId);
router.patch('/:id', authMiddleware, requireRole('admin', 'corretor'), leadController.atualizarDados);
router.delete('/:id', authMiddleware, requireRole('admin', 'corretor'), leadController.excluir);

module.exports = router;

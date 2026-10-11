'use strict';

const { Router } = require('express');
const { AgendamentoService } = require('../services/agendamentoService');
const { AgendamentoRepository } = require('../repositories/agendamentoRepository');
const { LeadService } = require('../services/leadService');
const { LeadRepository } = require('../repositories/leadRepository');
const { ClienteRepository } = require('../repositories/clienteRepository');
const { EquipeRepository } = require('../repositories/equipeRepository');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireRole } = require('../middlewares/requireRole');

const equipeRepository = new EquipeRepository();
const leadRepository = new LeadRepository();
const leadService = new LeadService({ leadRepository, clienteRepository: new ClienteRepository() });
const agendamentoService = new AgendamentoService({ agendamentoRepository: new AgendamentoRepository() });

const router = Router();

router.use(authMiddleware, requireRole('gerente'));

async function contexto(usuario) {
  const [equipes, todos, diretorias] = await Promise.all([
    equipeRepository.listarTimesDoGerente(usuario.id),
    equipeRepository.listar({}),
    equipeRepository.listarDiretorias(),
  ]);
  const membros = todos.filter((m) => m.cargo === 'corretor' && m.status === 'aprovado' && equipes.some((e) => e.id === m.equipe_id));
  return {
    equipes: equipes.map((e) => ({
      id: e.id,
      nome: e.nome,
      sede: e.sede ?? null,
      diretoria: diretorias.find((d) => d.id === e.diretoria_id)?.nome ?? null,
    })),
    membros: membros.map((m) => ({ id: m.id, nome: m.nome, email: m.email, telefone: m.telefone ?? null, ativo: m.ativo, equipeId: m.equipe_id })),
  };
}

function tratar(acao) {
  return async (req, res) => {
    try {
      return res.status(200).json(await acao(req));
    } catch (error) {
      console.error(error);
      return res.status(500).json({ code: 'SERVER_ERROR', message: 'Erro interno do servidor.' });
    }
  };
}

router.get('/equipe', tratar((req) => contexto(req.user)));

router.get('/leads', tratar(async (req) => {
  const { membros } = await contexto(req.user);
  const ids = new Set(membros.map((m) => m.id));
  const leads = await leadService.listar();
  return { leads: leads.filter((l) => l.corretor && ids.has(l.corretor.id)) };
}));

router.get('/agendamentos', tratar(async (req) => {
  const { membros } = await contexto(req.user);
  const ids = new Set(membros.map((m) => m.id));
  const agendamentos = await agendamentoService.listar();
  return { agendamentos: agendamentos.filter((a) => a.corretor && ids.has(a.corretor.id)) };
}));

/**
 */
router.patch('/leads/:id/corretor', async (req, res) => {
  try {
    const { membros } = await contexto(req.user);
    const ids = new Set(membros.filter((m) => m.ativo).map((m) => m.id));
    const { corretorId } = req.body ?? {};

    if (!corretorId || !ids.has(corretorId)) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Escolha um corretor da sua equipe.', fieldErrors: { corretorId: 'Corretor fora da sua equipe.' } });
    }
    const lead = await leadRepository.buscarPorId(req.params.id);
    if (!lead) return res.status(404).json({ code: 'NOT_FOUND', message: 'Lead não encontrado.' });
    if (!lead.corretor_id || !new Set(membros.map((m) => m.id)).has(lead.corretor_id)) {
      return res.status(403).json({ code: 'FORBIDDEN', message: 'Esse lead não está com um corretor da sua equipe.' });
    }
    return res.status(200).json({ lead: await leadService.atribuirCorretor(req.params.id, corretorId) });
  } catch (error) {
    if (error?.statusCode) return res.status(error.statusCode).json({ code: error.code, message: error.message, fieldErrors: error.fieldErrors });
    console.error(error);
    return res.status(500).json({ code: 'SERVER_ERROR', message: 'Erro interno do servidor.' });
  }
});

module.exports = router;
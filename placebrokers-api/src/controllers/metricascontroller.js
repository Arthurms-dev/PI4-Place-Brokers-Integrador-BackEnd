'use strict';

const { MetricasService } = require('../services/metricasservice');
const { MetricasRepository } = require('../repositories/metricasrepository');
const { EquipeRepository } = require('../repositories/equiperepository');
const { AppError } = require('../errors/AppError');

const metricasService = new MetricasService({
  metricasRepository: new MetricasRepository(),
  equipeRepository: new EquipeRepository(),
});

async function registrarEvento(req, res) {
  try {
    return res.status(202).json(await metricasService.registrarEvento(req.body, req.user));
  } catch (err) {
    return handleError(res, err);
  }
}

async function procura(req, res) {
  try {
    res.set('Cache-Control', 'public, max-age=600');
    return res.status(200).json({ procura: await metricasService.procura(req.params.empreendimentoId) });
  } catch (err) {
    return handleError(res, err);
  }
}

async function meusAcessos(req, res) {
  try {
    return res.status(200).json({ acessos: await metricasService.meusAcessos(req.user) });
  } catch (err) {
    return handleError(res, err);
  }
}

async function dashboard(req, res) {
  try {
    const { de, ate } = req.query;
    let { equipeId, diretoriaId } = req.query;
    const ehDiretor = req.user?.cargo === 'diretor';
    if (ehDiretor) {
      // O diretor só vê a própria diretoria, mesmo que mande outro filtro na URL.
      if (!req.user.diretoria_id) {
        throw new AppError('FORBIDDEN', 'Sua conta ainda não tem diretoria. Peça ao administrador para vincular.');
      }
      equipeId = undefined;
      diretoriaId = req.user.diretoria_id;
    }
    const dados = await metricasService.dashboard({ de, ate, equipeId, diretoriaId });
    // Os últimos leads são da Place toda (nome e telefone de cliente): ficam só com o admin.
    if (ehDiretor && dados?.leads) dados.leads = { ...dados.leads, recentes: [] };
    return res.status(200).json(dados);
  } catch (err) {
    return handleError(res, err);
  }
}

function handleError(res, err) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ code: err.code, message: err.message, fieldErrors: err.fieldErrors });
  }
  console.error(err);
  return res.status(500).json({ code: 'SERVER_ERROR', message: 'Erro interno do servidor.' });
}

module.exports = { registrarEvento, dashboard, meusAcessos, procura };

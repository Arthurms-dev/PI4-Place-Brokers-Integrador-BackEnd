'use strict';

const { AppError } = require('../errors/AppError');

const TIPOS_EVENTO = ['visualizacao_site', 'visualizacao_empreendimento', 'busca', 'contato'];
const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIA_MS = 24 * 60 * 60 * 1000;
const MAX_DIAS = 366;

function hojeEmSaoPaulo() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function somarDias(data, dias) {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function dataValida(data) {
  return DATA_REGEX.test(data) && !Number.isNaN(Date.parse(`${data}T00:00:00Z`)) && somarDias(data, 0) === data;
}

function diasEntre(de, ate) {
  return Math.round((new Date(`${ate}T00:00:00Z`) - new Date(`${de}T00:00:00Z`)) / DIA_MS) + 1;
}

const inicioDoDia = (data) => `${data}T00:00:00-03:00`;
const fimDoDia = (data) => `${data}T23:59:59.999-03:00`;

function variacao(atual, anterior) {
  if (anterior === 0) return atual > 0 ? 100 : 0;
  return Math.round(((atual - anterior) / anterior) * 1000) / 10;
}

const somarAcessos = (serie) => serie.reduce((total, linha) => total + Number(linha.acessos), 0);

class MetricasService {
  /** @param {{ metricasRepository, equipeRepository }} deps */
  constructor({ metricasRepository, equipeRepository }) {
    this.metricasRepository = metricasRepository;
    this.equipeRepository = equipeRepository;
  }

  /**
   * @param {{ tipo?: string, empreendimentoId?: string, sessaoId?: string }} dados
   * @param {{ id: string }|null} usuario quem está logado, se houver
   */
  async registrarEvento({ tipo, empreendimentoId, sessaoId } = {}, usuario = null) {
    const erros = {};
    if (!TIPOS_EVENTO.includes(tipo)) erros.tipo = 'Tipo de evento inválido.';
    if (typeof sessaoId !== 'string' || !sessaoId.trim() || sessaoId.length > 100) erros.sessaoId = 'Sessão inválida.';
    if (tipo === 'visualizacao_empreendimento' && !empreendimentoId) erros.empreendimentoId = 'Informe o empreendimento.';
    if (empreendimentoId && !UUID_REGEX.test(empreendimentoId)) erros.empreendimentoId = 'Empreendimento inválido.';
    if (Object.keys(erros).length) throw new AppError('VALIDATION_ERROR', 'Evento inválido.', erros);

    const evento = {
      tipo,
      empreendimento_id: empreendimentoId || null,
      usuario_id: usuario?.id ?? null,
      sessao_id: sessaoId.trim(),
    };

    const desde = new Date(Date.now() - DIA_MS).toISOString();
    const jaRegistrado = await this.metricasRepository.existeEventoRecente({
      tipo,
      sessao_id: evento.sessao_id,
      empreendimento_id: evento.empreendimento_id,
      desde,
    });
    if (jaRegistrado) return { registrado: false };

    try {
      await this.metricasRepository.inserirEvento(evento);
    } catch (err) {
      if (err?.code === '23503') {
        throw new AppError('VALIDATION_ERROR', 'Evento inválido.', { empreendimentoId: 'Empreendimento não encontrado.' });
      }
      throw err;
    }
    return { registrado: true };
  }

  async corretoresDoFiltro({ equipeId, diretoriaId }) {
    if (!equipeId && !diretoriaId) return null;

    let idsEquipes;
    if (diretoriaId) {
      const equipes = await this.equipeRepository.listarTimesPorDiretoria(diretoriaId);
      idsEquipes = equipes.map((e) => e.id);
    } else {
      idsEquipes = [equipeId];
    }

    const membros = await this.equipeRepository.listar({});
    return membros.filter((m) => idsEquipes.includes(m.equipe_id)).map((m) => m.id);
  }

  /**
   * @param {{ de?: string, ate?: string, equipeId?: string, diretoriaId?: string }} filtros
   *  
   */
  async dashboard({ de, ate, equipeId, diretoriaId } = {}) {
    const fim = ate ?? hojeEmSaoPaulo();
    const inicio = de ?? somarDias(fim, -29);

    const erros = {};
    if (!dataValida(fim)) erros.ate = 'Data final inválida (use AAAA-MM-DD).';
    if (!dataValida(inicio)) erros.de = 'Data inicial inválida (use AAAA-MM-DD).';
    if (equipeId && !UUID_REGEX.test(equipeId)) erros.equipeId = 'Equipe inválida.';
    if (diretoriaId && !UUID_REGEX.test(diretoriaId)) erros.diretoriaId = 'Diretoria inválida.';
    if (Object.keys(erros).length) throw new AppError('VALIDATION_ERROR', 'Filtros inválidos.', erros);

    if (inicio > fim) throw new AppError('VALIDATION_ERROR', 'Filtros inválidos.', { de: 'A data inicial vem depois da final.' });
    const dias = diasEntre(inicio, fim);
    if (dias > MAX_DIAS) throw new AppError('VALIDATION_ERROR', 'Filtros inválidos.', { de: 'Período máximo de 366 dias.' });

    const fimAnterior = somarDias(inicio, -1);
    const inicioAnterior = somarDias(fimAnterior, -(dias - 1));

    const corretorIds = await this.corretoresDoFiltro({ equipeId, diretoriaId });
    const repo = this.metricasRepository;

    const [serie, serieAnterior, imoveis, vgv, vgvAnterior, agendamentos, agendamentosAnterior] = await Promise.all([
      repo.acessosPorDia(inicio, fim),
      repo.acessosPorDia(inicioAnterior, fimAnterior),
      repo.imoveisMaisProcurados(inicioDoDia(inicio), fimDoDia(fim), 5),
      repo.vgv(inicioDoDia(inicio), fimDoDia(fim), corretorIds),
      repo.vgv(inicioDoDia(inicioAnterior), fimDoDia(fimAnterior), corretorIds),
      repo.contarAgendamentos(inicioDoDia(inicio), fimDoDia(fim)),
      repo.contarAgendamentos(inicioDoDia(inicioAnterior), fimDoDia(fimAnterior)),
    ]);

    const acessos = somarAcessos(serie);
    const acessosAnterior = somarAcessos(serieAnterior);
    const vgvTotal = Number(vgv.total);
    const vgvTotalAnterior = Number(vgvAnterior.total);

    return {
      periodo: { de: inicio, ate: fim, dias },
      vgv: {
        total: vgvTotal,
        quantidade: Number(vgv.quantidade),
        variacao: variacao(vgvTotal, vgvTotalAnterior),
      },
      acessos: {
        total: acessos,
        variacao: variacao(acessos, acessosAnterior),
        porDia: serie.slice(-7).map((l) => ({ dia: l.dia, acessos: Number(l.acessos) })),
      },
      imoveisMaisProcurados: imoveis.map((i) => ({
        id: i.empreendimento_id,
        nome: i.nome,
        visualizacoes: Number(i.visualizacoes),
      })),
      agendamentos: {
        total: agendamentos,
        variacao: variacao(agendamentos, agendamentosAnterior),
      },
      avaliacoes: { media: 0, total: 0 },
    };
  }
}

module.exports = { MetricasService };
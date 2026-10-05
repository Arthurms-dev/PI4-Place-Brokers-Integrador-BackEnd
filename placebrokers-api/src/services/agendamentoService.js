'use strict';

const { AppError } = require('../errors/AppError');

const TIPOS = ['visita_imovel', 'reuniao_escritorio'];
const STATUSES = ['agendado', 'confirmado', 'realizado', 'cancelado', 'nao_compareceu'];
const DURACAO_PADRAO_MINUTOS = 60;

function toPublicCliente(c) {
  if (!c) return null;
  return { id: c.id, nome: c.nome, telefone: c.telefone };
}

function toPublicCorretor(c) {
  if (!c) return null;
  return { id: c.id, nome: c.nome };
}

function toPublicEmpreendimento(e) {
  if (!e) return null;
  return { id: e.id, nome: e.nome, bairro: e.bairro, cidade: e.cidade, uf: e.uf, valor: e.valor };
}

function toPublicAgendamento(row) {
  return {
    id: row.id,
    tipo: row.tipo,
    dataHora: row.data_hora,
    duracaoMinutos: row.duracao_minutos,
    status: row.status,
    local: row.local,
    observacoes: row.observacoes,
    motivoCancelamento: row.motivo_cancelamento,
    interesseAposVisita: row.interesse_apos_visita,
    leadOrigemId: row.lead_origem_id,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
    cliente: toPublicCliente(row.cliente),
    corretor: toPublicCorretor(row.corretor),
    empreendimento: toPublicEmpreendimento(row.empreendimento),
  };
}

/**
 * @returns {Record<string,string>}
 */
function validarAgendamento({ tipo, dataHora, clienteId, corretorId, empreendimentoId } = {}) {
  const erros = {};
  if (!TIPOS.includes(tipo)) erros.tipo = 'Selecione o tipo do agendamento.';
  if (!dataHora || Number.isNaN(new Date(dataHora).getTime())) erros.dataHora = 'Informe uma data/hora válida.';
  if (!clienteId) erros.clienteId = 'Selecione o cliente.';
  if (!corretorId) erros.corretorId = 'Selecione o corretor.';
  if (tipo === 'visita_imovel' && !empreendimentoId) erros.empreendimentoId = 'Selecione o imóvel da visita.';
  return erros;
}

/** @returns {boolean} */
function periodosSeSobrepoe(inicioA, fimA, inicioB, fimB) {
  return inicioA < fimB && inicioB < fimA;
}

class AgendamentoService {
  /** @param {{ agendamentoRepository: object }} deps */
  constructor({ agendamentoRepository }) {
    this.agendamentoRepository = agendamentoRepository;
  }

  /** @returns {Promise<object[]>} */
  async listar() {
    const rows = await this.agendamentoRepository.listar();
    return rows.map(toPublicAgendamento);
  }

  /**
   * @param {{ corretorId: string, dataHora: string, duracaoMinutos: number, ignorarId?: string }} params
   * @returns {Promise<boolean>}
   */
  async _temConflito({ corretorId, dataHora, duracaoMinutos, ignorarId }) {
    const inicio = new Date(dataHora);
    const fim = new Date(inicio.getTime() + duracaoMinutos * 60000);
    const dataISO = inicio.toISOString().slice(0, 10);

    const doDia = await this.agendamentoRepository.listarPorCorretorEData(corretorId, dataISO);
    return doDia.some((ag) => {
      if (ignorarId && ag.id === ignorarId) return false;
      const inicioExistente = new Date(ag.data_hora);
      const fimExistente = new Date(inicioExistente.getTime() + (ag.duracao_minutos ?? DURACAO_PADRAO_MINUTOS) * 60000);
      return periodosSeSobrepoe(inicio, fim, inicioExistente, fimExistente);
    });
  }

  /**
   * @param {{ tipo: string, dataHora: string, duracaoMinutos?: number, clienteId: string,
   *   corretorId: string, empreendimentoId?: string|null, local?: string|null,
   *   observacoes?: string|null, leadOrigemId?: string|null }} dados
   * @returns {Promise<object>}
   */
  async criar(dados) {
    const erros = validarAgendamento(dados);
    if (Object.keys(erros).length) {
      throw new AppError('VALIDATION_ERROR', 'Verifique os campos destacados.', 400, erros);
    }

    const duracaoMinutos = dados.duracaoMinutos ?? DURACAO_PADRAO_MINUTOS;
    const temConflito = await this._temConflito({
      corretorId: dados.corretorId,
      dataHora: dados.dataHora,
      duracaoMinutos,
    });
    if (temConflito) {
      throw new AppError('CONFLITO_HORARIO', 'Este corretor já tem outro agendamento nesse horário.', 409);
    }

    const row = await this.agendamentoRepository.criar({ ...dados, duracaoMinutos });
    return toPublicAgendamento(row);
  }

  /**
   * @param {string} id
   * @param {string} dataHora
   * @returns {Promise<object>}
   */
  async remarcar(id, dataHora) {
    const agendamento = await this.agendamentoRepository.buscarPorId(id);
    if (!agendamento) throw new AppError('NOT_FOUND', 'Agendamento não encontrado.', 404);

    if (!dataHora || Number.isNaN(new Date(dataHora).getTime())) {
      throw new AppError('VALIDATION_ERROR', 'Informe uma data/hora válida.', 400, { dataHora: 'Data/hora inválida.' });
    }

    const temConflito = await this._temConflito({
      corretorId: agendamento.corretor?.id,
      dataHora,
      duracaoMinutos: agendamento.duracao_minutos ?? DURACAO_PADRAO_MINUTOS,
      ignorarId: id,
    });
    if (temConflito) {
      throw new AppError('CONFLITO_HORARIO', 'Este corretor já tem outro agendamento nesse horário.', 409);
    }

    const row = await this.agendamentoRepository.remarcar(id, dataHora);
    return toPublicAgendamento(row);
  }

  /**
   * @param {string} id
   * @param {string} status
   * @param {{ motivoCancelamento?: string, interesseAposVisita?: string }} [extra]
   * @returns {Promise<object>}
   */
  async atualizarStatus(id, status, extra = {}) {
    if (!STATUSES.includes(status)) {
      throw new AppError('VALIDATION_ERROR', 'Status inválido.', 400, { status: 'Selecione um status válido.' });
    }
    if (status === 'cancelado' && !extra.motivoCancelamento?.trim()) {
      throw new AppError('VALIDATION_ERROR', 'Informe o motivo do cancelamento.', 400, {
        motivoCancelamento: 'Campo obrigatório ao cancelar.',
      });
    }

    const agendamento = await this.agendamentoRepository.buscarPorId(id);
    if (!agendamento) throw new AppError('NOT_FOUND', 'Agendamento não encontrado.', 404);

    if (status === 'realizado' && new Date(agendamento.data_hora) > new Date()) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Só é possível marcar como realizado depois da data/hora do agendamento.',
        400
      );
    }

    const row = await this.agendamentoRepository.atualizarStatus(id, status, extra);
    if (!row) throw new AppError('NOT_FOUND', 'Agendamento não encontrado.', 404);
    return toPublicAgendamento(row);
  }
}

module.exports = { AgendamentoService, toPublicAgendamento, validarAgendamento };
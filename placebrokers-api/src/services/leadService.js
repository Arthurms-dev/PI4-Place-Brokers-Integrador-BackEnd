'use strict';

const { AppError } = require('../errors/AppError');

const LEAD_STATUSES = ['novo', 'em_atendimento', 'convertido', 'perdido'];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param {{ nome: string, email: string, telefone: string }} dados
 * @returns {Record<string,string>}
 */
function validarLead({ nome, email, telefone } = {}) {
  const erros = {};
  if (!nome?.trim()) erros.nome = 'Informe o nome.';
  if (!email?.trim() || !EMAIL_REGEX.test(email.trim())) erros.email = 'E-mail inválido.';

  const digitos = (telefone ?? '').replace(/\D/g, '');
  if (digitos.length < 10 || digitos.length > 11) erros.telefone = 'Telefone inválido.';

  return erros;
}

function toPublicEmpreendimento(e) {
  if (!e) return null;
  return { id: e.id, nome: e.nome, bairro: e.bairro, cidade: e.cidade, uf: e.uf };
}

function toPublicCorretor(c) {
  if (!c) return null;
  return { id: c.id, nome: c.nome };
}

function toPublicLead(row) {
  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    telefone: row.telefone,
    origem: row.origem,
    mensagem: row.mensagem,
    status: row.status,
    criadoEm: row.criado_em,
    corretor: toPublicCorretor(row.corretor),
    empreendimento: toPublicEmpreendimento(row.empreendimento),
  };
}

class LeadService {
  /**
   * @param {object} deps
   * @param {{ listar: Function, buscarPorId: Function, atualizarStatus: Function, atribuirCorretor: Function, criar: Function }} deps.leadRepository
   * @param {{ criar: Function }} deps.clienteRepository
   */
  constructor({ leadRepository, clienteRepository }) {
    this.leadRepository = leadRepository;
    this.clienteRepository = clienteRepository;
  }

  /** @returns {Promise<object[]>} */
  async listar() {
    const rows = await this.leadRepository.listar();
    return rows.map(toPublicLead);
  }

  /**
   * @param {string} id
   * @param {string} status
   * @returns {Promise<object>}
   */
  async atualizarStatus(id, status) {
    if (!LEAD_STATUSES.includes(status)) {
      throw new AppError('VALIDATION_ERROR', 'Status inválido.', 400, {
        status: 'Selecione um status válido.',
      });
    }

    const row = await this.leadRepository.atualizarStatus(id, status);
    if (!row) throw new AppError('NOT_FOUND', 'Lead não encontrado.', 404);
    return toPublicLead(row);
  }

  /**
   * @param {string} id
   * @param {string|null} corretorId 
   * @returns {Promise<object>}
   */
  async atribuirCorretor(id, corretorId) {
    const row = await this.leadRepository.atribuirCorretor(id, corretorId ?? null);
    if (!row) throw new AppError('NOT_FOUND', 'Lead não encontrado.', 404);
    return toPublicLead(row);
  }

  /**
   * @param {string} id
   * @returns {Promise<{ cliente: object, lead: object }>}
   */
  async converterEmCliente(id) {
    const lead = await this.leadRepository.buscarPorId(id);
    if (!lead) throw new AppError('NOT_FOUND', 'Lead não encontrado.', 404);

    if (!lead.corretor) {
      throw new AppError('VALIDATION_ERROR', 'Atribua um corretor ao lead antes de converter em cliente.', 400, {
        corretor: 'Selecione um corretor responsável.',
      });
    }
    if (lead.status === 'convertido') {
      throw new AppError('VALIDATION_ERROR', 'Este lead já foi convertido em cliente.', 400);
    }

    const cliente = await this.clienteRepository.criar({
      nome: lead.nome,
      email: lead.email,
      telefone: lead.telefone,
      corretorId: lead.corretor.id,
      leadId: lead.id,
    });

    const atualizado = await this.leadRepository.atualizarStatus(id, 'convertido');
    return { cliente, lead: toPublicLead(atualizado) };
  }

  /**
   * @param {{ nome: string, email: string, telefone: string, empreendimentoId?: string|null, mensagem?: string|null }} dados
   * @returns {Promise<object>}
   */
  async criar({ nome, email, telefone, empreendimentoId, mensagem }) {
    const erros = validarLead({ nome, email, telefone });
    if (Object.keys(erros).length) {
      throw new AppError('VALIDATION_ERROR', 'Verifique os campos destacados.', 400, erros);
    }

    const row = await this.leadRepository.criar({
      nome: nome.trim(),
      email: email.trim().toLowerCase(),
      telefone: telefone.trim(),
      empreendimentoId: empreendimentoId ?? null,
      mensagem: mensagem?.trim() || null,
      origem: 'site',
    });
    return toPublicLead(row);
  }
}

module.exports = { LeadService, toPublicLead, validarLead };
'use strict';

const { AppError } = require('../errors/AppError');

const LEAD_STATUSES = ['novo', 'em_atendimento', 'convertido', 'perdido'];
const STATUS_PERMITIDOS_AO_CORRETOR = ['novo', 'em_atendimento', 'perdido'];

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
   * @param {{ listar: Function, listarPorCorretor: Function, buscarPorId: Function, atualizarStatus: Function, atribuirCorretor: Function, criar: Function }} deps.leadRepository
   * @param {{ criar: Function }} deps.clienteRepository
   */
  constructor({ leadRepository, clienteRepository }) {
    this.leadRepository = leadRepository;
    this.clienteRepository = clienteRepository;
  }

  async listar() {
    const rows = await this.leadRepository.listar();
    return rows.map(toPublicLead);
  }

  /** Consulta a carteira da equipe no banco, mantendo o mesmo formato da API. */
  async listarPorCorretores(corretorIds) {
    const rows = await this.leadRepository.listarPorCorretores(corretorIds);
    return rows.map(toPublicLead);
  }

  async listarDoCorretor(usuario) {
    const rows = await this.leadRepository.listarPorCorretor(usuario.id);
    return rows.map(toPublicLead);
  }

  /**
   * @param {string} id
   * @param {string} status
   * @param {{ id: string, cargo: string }} [usuario]
   */
  async atualizarStatus(id, status, usuario) {
    if (!LEAD_STATUSES.includes(status)) {
      throw new AppError('VALIDATION_ERROR', 'Status inválido.', 400, {
        status: 'Selecione um status válido.',
      });
    }

    if (usuario && usuario.cargo !== 'admin') {
      if (!STATUS_PERMITIDOS_AO_CORRETOR.includes(status)) {
        throw new AppError('FORBIDDEN', 'A conversão em cliente é feita pelo administrador.', 403);
      }
      const lead = await this.leadRepository.buscarPorId(id);
      if (!lead) throw new AppError('NOT_FOUND', 'Lead não encontrado.', 404);
      if (lead.corretor?.id !== usuario.id) {
        throw new AppError('FORBIDDEN', 'Esse lead não está atribuído a você.', 403);
      }
    }

    const row = await this.leadRepository.atualizarStatus(id, status);
    if (!row) throw new AppError('NOT_FOUND', 'Lead não encontrado.', 404);
    return toPublicLead(row);
  }

  /**
   * @param {string} id
   * @param {string|null} corretorId
   */
  async atribuirCorretor(id, corretorId) {
    let row;
    try {
      row = await this.leadRepository.atribuirCorretor(id, corretorId ?? null);
    } catch (err) {
      if (err?.code === '23503' || err?.code === '22P02') {
        throw new AppError('VALIDATION_ERROR', 'Corretor inválido.', 400, { corretorId: 'Selecione um corretor válido.' });
      }
      throw err;
    }
    if (!row) throw new AppError('NOT_FOUND', 'Lead não encontrado.', 404);
    return toPublicLead(row);
  }

  /**
   * @param {string} id
   * @returns {Promise<{ cliente: object, lead: object }>}
   */
  async converterEmCliente(id) {
    // A RPC faz INSERT do cliente + UPDATE do lead numa transacao do PostgreSQL.
    // A consulta apos o COMMIT preserva o formato existente da API.
    const clienteId = await this.clienteRepository.converterLeadEmCliente(id);
    const [cliente, atualizado] = await Promise.all([
      this.clienteRepository.buscarPorId(clienteId),
      this.leadRepository.buscarPorId(id),
    ]);
    if (!cliente || !atualizado) {
      throw new AppError('SERVER_ERROR', 'Conversão realizada, mas não foi possível consultar seu resultado. Atualize a página.');
    }
    return { cliente, lead: toPublicLead(atualizado) };
  }

  /**
   * @param {{ nome: string, email: string, telefone: string, empreendimentoId?: string|null, mensagem?: string|null }} dados
   */
  async criar({ nome, email, telefone, empreendimentoId, mensagem }) {
    const erros = validarLead({ nome, email, telefone });
    if (Object.keys(erros).length) {
      throw new AppError('VALIDATION_ERROR', 'Verifique os campos destacados.', 400, erros);
    }

    let row;
    try {
      row = await this.leadRepository.criar({
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        telefone: telefone.trim(),
        empreendimentoId: empreendimentoId ?? null,
        mensagem: mensagem?.trim() || null,
        origem: 'site',
      });
    } catch (err) {
      if (err?.code === '23503' || err?.code === '22P02') {
        throw new AppError('VALIDATION_ERROR', 'Empreendimento inválido.', 400, { empreendimentoId: 'Empreendimento não encontrado.' });
      }
      throw err;
    }
    return toPublicLead(row);
  }
}

module.exports = { LeadService, toPublicLead, validarLead };
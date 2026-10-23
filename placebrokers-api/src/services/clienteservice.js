'use strict';

const { AppError } = require('../errors/AppError');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toPublicCorretor(c) {
  if (!c) return null;
  return { id: c.id, nome: c.nome };
}

function toPublicLeadResumo(l) {
  if (!l) return null;
  return { id: l.id, nome: l.nome };
}

function toPublicCliente(row) {
  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    telefone: row.telefone,
    observacoes: row.observacoes,
    criadoEm: row.criado_em,
    corretor: toPublicCorretor(row.corretor),
    leadOrigem: toPublicLeadResumo(row.lead),
  };
}

/**
 * @returns {Record<string,string>}
 */
function validarCliente({ nome, email, telefone } = {}, { exigirCampos = true } = {}) {
  const erros = {};

  if (exigirCampos ? !nome?.trim() : nome !== undefined && !nome.trim()) {
    erros.nome = 'Informe o nome.';
  }

  if (telefone !== undefined || exigirCampos) {
    const digitos = (telefone ?? '').replace(/\D/g, '');
    if (digitos.length < 10 || digitos.length > 11) erros.telefone = 'Telefone inválido (com DDD).';
  }

  if (email?.trim() && !EMAIL_REGEX.test(email.trim())) erros.email = 'E-mail inválido.';

  return erros;
}

class ClienteService {
  /** @param {{ clienteRepository: object }} deps */
  constructor({ clienteRepository }) {
    this.clienteRepository = clienteRepository;
  }

  /**
   * @param {{ id: string, cargo: string }} usuario
   * @returns {Promise<object[]>}
   */
  async listar(usuario) {
    const rows =
      usuario.cargo === 'admin'
        ? await this.clienteRepository.listar()
        : await this.clienteRepository.listarPorCorretor(usuario.id);
    return rows.map(toPublicCliente);
  }

  /**
   * @param {string} id
   * @param {{ id: string, cargo: string }} usuario
   * @returns {Promise<object>}
   */
  async buscarPorId(id, usuario) {
    const row = await this.clienteRepository.buscarPorId(id);
    if (!row) throw new AppError('NOT_FOUND', 'Cliente não encontrado.', 404);

    if (usuario.cargo !== 'admin' && row.corretor?.id !== usuario.id) {
      throw new AppError('FORBIDDEN', 'Você não tem acesso a este cliente.', 403);
    }

    return toPublicCliente(row);
  }

  /**
   * @param {{ nome: string, email?: string, telefone: string, observacoes?: string, corretorId?: string }} dados
   * @param {{ id: string, cargo: string }} usuario
   * @returns {Promise<object>}
   */
  async criar(dados, usuario) {
    const erros = validarCliente(dados);
    const corretorId = usuario.cargo === 'admin' ? dados.corretorId : usuario.id;
    if (!corretorId) erros.corretorId = 'Selecione o corretor responsável.';
    if (Object.keys(erros).length) {
      throw new AppError('VALIDATION_ERROR', 'Verifique os campos destacados.', 400, erros);
    }

    try {
      const row = await this.clienteRepository.criar({
        nome: dados.nome.trim(),
        email: dados.email?.trim().toLowerCase() || null,
        telefone: dados.telefone.replace(/\D/g, ''),
        observacoes: dados.observacoes?.trim() || null,
        corretorId,
        leadId: dados.leadId ?? null,
      });
      return toPublicCliente(row);
    } catch (err) {
      if (err?.code === '23503' || err?.code === '22P02') {
        throw new AppError('VALIDATION_ERROR', 'Corretor inválido.', 400, { corretorId: 'Corretor não encontrado.' });
      }
      throw err;
    }
  }

  /**
   * @param {string} id
   * @param {{ nome?: string, email?: string, telefone?: string, observacoes?: string, corretorId?: string }} dados
   * @param {{ id: string, cargo: string }} usuario
   * @returns {Promise<object>}
   */
  async atualizar(id, dados, usuario) {
    const existente = await this.clienteRepository.buscarPorId(id);
    if (!existente) throw new AppError('NOT_FOUND', 'Cliente não encontrado.', 404);

    if (usuario.cargo !== 'admin' && existente.corretor?.id !== usuario.id) {
      throw new AppError('FORBIDDEN', 'Você não tem acesso a este cliente.', 403);
    }

    if (usuario.cargo !== 'admin' && dados.corretorId !== undefined) {
      throw new AppError('FORBIDDEN', 'Apenas o admin pode reatribuir o corretor responsável.', 403);
    }

    const erros = validarCliente(dados, { exigirCampos: false });
    if (Object.keys(erros).length) {
      throw new AppError('VALIDATION_ERROR', 'Verifique os campos destacados.', 400, erros);
    }

    const atualizacao = { ...dados };
    if (atualizacao.nome !== undefined) atualizacao.nome = atualizacao.nome.trim();
    if (atualizacao.email !== undefined) atualizacao.email = atualizacao.email?.trim().toLowerCase() || null;
    if (atualizacao.telefone !== undefined) atualizacao.telefone = atualizacao.telefone.replace(/\D/g, '');
    if (atualizacao.observacoes !== undefined) atualizacao.observacoes = atualizacao.observacoes?.trim() || null;

    try {
      const row = await this.clienteRepository.atualizar(id, atualizacao);
      if (!row) throw new AppError('NOT_FOUND', 'Cliente não encontrado.', 404);
      return toPublicCliente(row);
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err?.code === '23503' || err?.code === '22P02') {
        throw new AppError('VALIDATION_ERROR', 'Corretor inválido.', 400, { corretorId: 'Corretor não encontrado.' });
      }
      throw err;
    }
  }
}

module.exports = { ClienteService, toPublicCliente, validarCliente };
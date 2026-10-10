'use strict';

const { AppError } = require('../errors/AppError');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toPublicCliente(row) {
  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    telefone: row.telefone,
    observacoes: row.observacoes,
    corretorId: row.corretor_id,
    leadId: row.lead_id,
    criadoEm: row.criado_em,
  };
}

/** @returns {Record<string,string>} */
function validarCliente({ nome, email, telefone } = {}) {
  const erros = {};
  if (!nome?.trim()) erros.nome = 'Informe o nome.';
  const digitos = (telefone ?? '').replace(/\D/g, '');
  if (digitos.length < 10 || digitos.length > 11) erros.telefone = 'Telefone inválido (com DDD).';
  if (email?.trim() && !EMAIL_REGEX.test(email.trim())) erros.email = 'E-mail inválido.';
  return erros;
}

class ClienteService {
  /** @param {{ clienteRepository: object }} deps */
  constructor({ clienteRepository }) {
    this.clienteRepository = clienteRepository;
  }

  async listar(usuario) {
    const rows =
      usuario.cargo === 'admin'
        ? await this.clienteRepository.listar()
        : await this.clienteRepository.listarPorCorretor(usuario.id);
    return rows.map(toPublicCliente);
  }

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
      });
      return toPublicCliente(row);
    } catch (err) {
      if (err?.code === '23503' || err?.code === '22P02') {
        throw new AppError('VALIDATION_ERROR', 'Corretor inválido.', 400, { corretorId: 'Corretor não encontrado.' });
      }
      throw err;
    }
  }
}

module.exports = { ClienteService, toPublicCliente, validarCliente };
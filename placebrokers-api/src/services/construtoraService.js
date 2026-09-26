'use strict';

const { AppError } = require('../errors/AppError');

class ConstrutoraService {
  constructor({ construtoraRepository }) {
    this.construtoraRepository = construtoraRepository;
  }

  listar() {
    return this.construtoraRepository.listar();
  }

  criar(dados) {
    if (!dados.nome?.trim()) {
      throw new AppError('VALIDATION_ERROR', 'Verifique os campos destacados.', { nome: 'Informe o nome da construtora.' });
    }
    return this.construtoraRepository.criar(dados);
  }
}

module.exports = { ConstrutoraService };
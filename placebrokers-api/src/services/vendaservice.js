'use strict';

const { AppError } = require('../errors/AppError');

class VendaService {
  /** @param {{ vendaRepository, equipeRepository }} deps */
  constructor({ vendaRepository, equipeRepository }) {
    this.vendaRepository = vendaRepository;
    this.equipeRepository = equipeRepository;
  }

  /** @param {{ id: string, cargo: string }} usuario @returns {Promise<string[]>} */
  async corretoresVisiveis(usuario) {
    if (usuario.cargo === 'admin') return null;
    if (usuario.cargo === 'gerente') {
      const equipes = await this.equipeRepository.listarTimesDoGerente(usuario.id);
      if (!equipes.length) return [];
      const membros = await this.equipeRepository.listar({});
      return membros.filter((m) => equipes.some((e) => e.id === m.equipe_id)).map((m) => m.id);
    }
    return [usuario.id]; // corretor só vê a si mesmo
  }

  async criar({ valor, empreendimentoId, clienteId } = {}, corretor) {
    const numero = Number(valor);
    if (!valor || Number.isNaN(numero) || numero <= 0) {
      throw new AppError('VALIDATION_ERROR', 'Verifique os campos destacados.', { valor: 'Informe um valor de venda válido.' });
    }

    return this.vendaRepository.criar({
      corretor_id: corretor.id,
      cliente_id: clienteId || null,
      empreendimento_id: empreendimentoId || null,
      valor: numero,
      status: 'pendente',
    });
  }

  /** @param {{ id: string, cargo: string }} usuario */
  async listar(usuario) {
    const ids = await this.corretoresVisiveis(usuario);
    if (ids === null) return this.vendaRepository.listarTodas();
    return this.vendaRepository.listarPorCorretores(ids);
  }

  /**
   * @param {string} id @param {"confirmada"|"recusada"} status
   * @param {{ id: string, cargo: string }} usuario
   */
  async decidir(id, status, usuario) {
    if (!['confirmada', 'recusada'].includes(status)) {
      throw new AppError('VALIDATION_ERROR', 'Verifique os campos destacados.', { status: 'Status inválido.' });
    }
    if (usuario.cargo !== 'admin' && usuario.cargo !== 'gerente') {
      throw new AppError('FORBIDDEN', 'Só gerente ou admin confirmam vendas.');
    }

    const venda = await this.vendaRepository.buscarPorId(id);
    if (!venda) throw new AppError('NOT_FOUND', 'Venda não encontrada.');

    if (venda.status !== 'pendente') {
      throw new AppError('CONFLICT', 'Essa venda já foi decidida.', 409);
    }

    if (usuario.cargo === 'gerente') {
      const idsVisiveis = await this.corretoresVisiveis(usuario);
      if (!idsVisiveis.includes(venda.corretor_id)) {
        throw new AppError('FORBIDDEN', 'Essa venda não é da sua equipe.');
      }
    }

    const atualizada = await this.vendaRepository.atualizar(id, {
      status,
      confirmado_por: usuario.id,
      confirmado_em: new Date().toISOString(),
    });
    if (status === 'confirmada') {
      try {
        await this.vendaRepository.converterLeadDoCliente(venda.cliente_id);
      } catch (err) {
        console.error('Venda confirmada, mas não foi possível marcar o lead como convertido:', err);
      }
    }
    return atualizada;
  }

  /**
   * @param {{ id: string, cargo: string }} usuario
   * @param {{ equipeId?: string, diretoriaId?: string }} filtros
   */
  async vgv(usuario, { equipeId, diretoriaId } = {}) {
    let vendas;

    if (usuario.cargo === 'admin' && (equipeId || diretoriaId)) {
      const membros = await this.equipeRepository.listar({});
      let equipesAlvo = [];
      if (diretoriaId) equipesAlvo = await this.equipeRepository.listarTimesPorDiretoria(diretoriaId);
      const idsEquipes = diretoriaId ? equipesAlvo.map((e) => e.id) : [equipeId];
      const ids = membros.filter((m) => idsEquipes.includes(m.equipe_id)).map((m) => m.id);
      vendas = await this.vendaRepository.listarPorCorretores(ids);
    } else {
      const ids = await this.corretoresVisiveis(usuario);
      vendas = ids === null ? await this.vendaRepository.listarTodas() : await this.vendaRepository.listarPorCorretores(ids);
    }

    const confirmadas = vendas.filter((v) => v.status === 'confirmada');
    return {
      total: confirmadas.reduce((soma, v) => soma + Number(v.valor), 0),
      quantidade: confirmadas.length,
    };
  }
}

module.exports = { VendaService };
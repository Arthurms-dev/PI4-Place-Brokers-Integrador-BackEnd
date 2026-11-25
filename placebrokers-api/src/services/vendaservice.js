'use strict';

const { AppError } = require('../errors/AppError');

/** Data de hoje em Recife (UTC-3), no formato AAAA-MM-DD. */
function hojeEmRecife(agora = new Date()) {
  return new Date(agora.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Valida a data da venda: AAAA-MM-DD, não futura e no máximo 1 ano atrás. */
function validarDataVenda(valor, agora = new Date()) {
  if (!valor) return 'Informe a data da venda.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor) || Number.isNaN(Date.parse(`${valor}T12:00:00Z`))) return 'Data inválida.';
  const hoje = hojeEmRecife(agora);
  if (valor > hoje) return 'A data da venda não pode ser futura.';
  const umAnoAtras = new Date(`${hoje}T12:00:00Z`);
  umAnoAtras.setUTCFullYear(umAnoAtras.getUTCFullYear() - 1);
  if (valor < umAnoAtras.toISOString().slice(0, 10)) return 'A data da venda tem mais de 1 ano.';
  return null;
}

class VendaService {
  /** @param {{ vendaRepository, equipeRepository }} deps */
  constructor({ vendaRepository, equipeRepository, clienteRepository }) {
    this.vendaRepository = vendaRepository;
    this.equipeRepository = equipeRepository;
    this.clienteRepository = clienteRepository;
  }

  /** @param {{ id: string, cargo: string }} usuario @returns {Promise<string[]>} */
  async corretoresVisiveis(usuario) {
    if (usuario.cargo === 'admin') return null;
    if (usuario.cargo === 'diretor') {
      // Só leitura: corretores das equipes da diretoria dele. Sem diretoria, não vê nada.
      if (!usuario.diretoria_id) return [];
      const equipes = await this.equipeRepository.listarTimesPorDiretoria(usuario.diretoria_id);
      if (!equipes.length) return [];
      const membros = await this.equipeRepository.listar({});
      return membros.filter((m) => equipes.some((e) => e.id === m.equipe_id)).map((m) => m.id);
    }
    if (usuario.cargo === 'gerente') {
      const equipes = await this.equipeRepository.listarTimesDoGerente(usuario.id);
      if (!equipes.length) return [];
      const membros = await this.equipeRepository.listar({});
      return membros.filter((m) => equipes.some((e) => e.id === m.equipe_id)).map((m) => m.id);
    }
    return [usuario.id]; 
  }

  async criar({ valor, empreendimentoId, clienteId, unidade, dataVenda } = {}, corretor) {
    const numero = Number(valor);
    if (valor === null || valor === undefined || valor === '' || !Number.isFinite(numero) || numero <= 0) {
      throw new AppError('VALIDATION_ERROR', 'Verifique os campos destacados.', 400, { valor: 'Informe um valor de venda válido.' });
    }
    if (!clienteId) {
      throw new AppError('VALIDATION_ERROR', 'Verifique os campos destacados.', 400, { clienteId: 'Selecione o cliente da sua carteira.' });
    }

    // O navegador não é fonte de autorização. Verificar no banco que o cliente
    // informado pertence ao corretor autenticado (inclusive via API direta).
    const cliente = await this.clienteRepository.buscarPorId(clienteId);
    if (!cliente) throw new AppError('NOT_FOUND', 'Cliente não encontrado.', 404);
    if (cliente.corretor?.id !== corretor.id) {
      throw new AppError('FORBIDDEN', 'Esse cliente não pertence à sua carteira.', 403);
    }

    const unidadeLimpa = String(unidade ?? '').trim().replace(/\s+/g, ' ');
    if (!unidadeLimpa) {
      throw new AppError('VALIDATION_ERROR', 'Verifique os campos destacados.', 400, { unidade: 'Informe a unidade vendida (ex.: Torre A, 1203).' });
    }
    if (unidadeLimpa.length > 40) {
      throw new AppError('VALIDATION_ERROR', 'Verifique os campos destacados.', 400, { unidade: 'Use no máximo 40 caracteres.' });
    }
    const erroData = validarDataVenda(dataVenda);
    if (erroData) {
      throw new AppError('VALIDATION_ERROR', 'Verifique os campos destacados.', 400, { dataVenda: erroData });
    }
    return this.vendaRepository.criar({
      corretor_id: corretor.id,
      cliente_id: clienteId || null,
      empreendimento_id: empreendimentoId || null,
      valor: numero,
      unidade: unidadeLimpa,
      data_venda: dataVenda,
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

  /** Venda visível para o cargo (mesma regra da listagem). */
  async buscarPorId(id, usuario) {
    const venda = await this.vendaRepository.buscarPorId(id);
    if (!venda) throw new AppError('NOT_FOUND', 'Venda não encontrada.');
    const ids = await this.corretoresVisiveis(usuario);
    if (ids !== null && !ids.includes(venda.corretor_id)) {
      throw new AppError('FORBIDDEN', 'Você não tem acesso a essa venda.');
    }
    return venda;
  }

  /** @private Venda do próprio corretor, ainda aguardando o gerente. */
  async _pendenteDoCorretor(id, usuario) {
    const venda = await this.vendaRepository.buscarPorId(id);
    if (!venda) throw new AppError('NOT_FOUND', 'Venda não encontrada.');
    if (usuario.cargo !== 'admin' && venda.corretor_id !== usuario.id) {
      throw new AppError('FORBIDDEN', 'Essa venda é de outro corretor.');
    }
    if (venda.status !== 'pendente') {
      // Venda confirmada conta no VGV e recusada é histórico: nenhuma das duas muda.
      throw new AppError('CONFLICT', 'Só dá para mudar uma venda que ainda aguarda o gerente.', 409);
    }
    return venda;
  }

  /**
   * O corretor corrige a própria venda enquanto o gerente não decide.
   * @param {string} id
   * @param {{ valor?: number, unidade?: string, dataVenda?: string, empreendimentoId?: string|null }} dados
   */
  async editar(id, dados = {}, usuario) {
    await this._pendenteDoCorretor(id, usuario);
    const campos = {};
    const erros = {};
    if (dados.valor !== undefined) {
      const numero = Number(dados.valor);
      if (dados.valor === null || dados.valor === '' || !Number.isFinite(numero) || numero <= 0) erros.valor = 'Informe um valor de venda válido.';
      else campos.valor = numero;
    }
    if (dados.unidade !== undefined) {
      const unidade = String(dados.unidade ?? '').trim().replace(/\s+/g, ' ');
      if (!unidade) erros.unidade = 'Informe a unidade vendida (ex.: Torre A, 1203).';
      else if (unidade.length > 40) erros.unidade = 'Use no máximo 40 caracteres.';
      else campos.unidade = unidade;
    }
    if (dados.dataVenda !== undefined) {
      const erroData = validarDataVenda(dados.dataVenda);
      if (erroData) erros.dataVenda = erroData;
      else campos.data_venda = dados.dataVenda;
    }
    if (dados.empreendimentoId !== undefined) campos.empreendimento_id = dados.empreendimentoId || null;
    if (Object.keys(erros).length) {
      throw new AppError('VALIDATION_ERROR', 'Verifique os campos destacados.', 400, erros);
    }
    if (!Object.keys(campos).length) {
      throw new AppError('VALIDATION_ERROR', 'Nada para alterar.', 400);
    }
    return this.vendaRepository.atualizar(id, campos);
  }

  /** Exclui venda ainda pendente (lançada por engano). */
  async excluir(id, usuario) {
    await this._pendenteDoCorretor(id, usuario);
    const excluiu = await this.vendaRepository.excluir(id);
    if (!excluiu) throw new AppError('NOT_FOUND', 'Venda não encontrada.');
  }
}

module.exports = { VendaService, validarDataVenda };
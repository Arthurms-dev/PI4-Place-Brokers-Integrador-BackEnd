'use strict';

const { AppError } = require('../errors/AppError');

const TIPOS_DOCUMENTO = { book: 'book_url', tabela: 'tabela_url' };
const PERIODOS = [7, 30, 90];
const DIAS_PARA_DESATUALIZAR = 30;
const PESOS = { visualizacoes: 1, leads: 5, visitas: 8 };

function numeroOuNulo(valor) {
  if (valor === null || valor === '' || valor === undefined) return null;
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

function toPublicProduto(row) {
  return {
    id: row.id,
    nome: row.nome,
    slug: row.slug,
    status: row.status,
    cidade: row.cidade,
    uf: row.uf,
    bairro: row.bairro,
    construtora: row.construtora?.nome ?? null,
    capaUrl: row.capa_url ?? null,
    disponivel: Boolean(row.disponivel),
    publicado: Boolean(row.publicado),
    precoMin: row.preco_min ?? null,
    precoMax: row.preco_max ?? null,
    temBook: Boolean(row.book_url),
    temTabela: Boolean(row.tabela_url),
    temCoordenadas: row.latitude != null && row.longitude != null,
    documentosAtualizadosEm: row.documentos_atualizados_em ?? null,
  };
}
function pendenciasDe(row, agora = new Date()) {
  const lista = [];
  if (!row.book_url) lista.push('sem_book');
  if (!row.tabela_url) lista.push('sem_tabela');
  if (row.preco_min == null) lista.push('sem_preco');
  if (row.latitude == null || row.longitude == null) lista.push('sem_coordenadas');
  const atualizado = row.documentos_atualizados_em ? new Date(row.documentos_atualizados_em) : null;
  if ((row.book_url || row.tabela_url) && (!atualizado || agora - atualizado > DIAS_PARA_DESATUALIZAR * 86400000)) {
    lista.push('documentos_desatualizados');
  }
  return lista;
}

class ViabilizadorService {
  /** @param {{ viabilizadorRepository: object, uploadService: object }} deps */
  constructor({ viabilizadorRepository, uploadService }) {
    this.viabilizadorRepository = viabilizadorRepository;
    this.uploadService = uploadService;
  }

  async _produtoDele(id, usuario) {
    const produto = await this.viabilizadorRepository.buscarProduto(id);
    if (!produto) throw new AppError('NOT_FOUND', 'Produto não encontrado.', 404);
    if (!usuario.construtora_id || produto.construtora_id !== usuario.construtora_id) {
      throw new AppError('FORBIDDEN', 'Este produto não é da sua construtora.', 403);
    }
    return produto;
  }

  async _carteira(usuario) {
    if (!usuario.construtora_id) return { construtora: null, linhas: [] };
    const [construtora, linhas] = await Promise.all([
      this.viabilizadorRepository.buscarConstrutora(usuario.construtora_id),
      this.viabilizadorRepository.listarProdutosDaConstrutora(usuario.construtora_id),
    ]);
    return { construtora, linhas };
  }

  async listarProdutos(usuario) {
    const { construtora, linhas } = await this._carteira(usuario);
    return {
      construtora: construtora ? { id: construtora.id, nome: construtora.nome } : null,
      produtos: linhas.map((l) => ({ ...toPublicProduto(l), pendencias: pendenciasDe(l) })),
    };
  }

  async atualizarProduto(id, mudancas = {}, usuario) {
    const produto = await this._produtoDele(id, usuario);
    const dados = {};
    const erros = {};

    if (mudancas.disponivel !== undefined) {
      if (typeof mudancas.disponivel !== 'boolean') erros.disponivel = 'Informe verdadeiro ou falso.';
      else dados.disponivel = mudancas.disponivel;
    }
    for (const [campo, coluna] of [['precoMin', 'preco_min'], ['precoMax', 'preco_max']]) {
      if (mudancas[campo] === undefined) continue;
      const n = numeroOuNulo(mudancas[campo]);
      if (Number.isNaN(n)) erros[campo] = 'Informe um valor válido.';
      else dados[coluna] = n;
    }

    const min = 'preco_min' in dados ? dados.preco_min : produto.preco_min;
    const max = 'preco_max' in dados ? dados.preco_max : produto.preco_max;
    if (!erros.precoMax && min != null && max != null && min > max) erros.precoMax = 'O preço máximo não pode ser menor que o mínimo.';

    if (Object.keys(erros).length) throw new AppError('VALIDATION_ERROR', 'Verifique os campos destacados.', 400, erros);
    if (!Object.keys(dados).length) throw new AppError('VALIDATION_ERROR', 'Nada para atualizar.', 400);

    const atualizado = await this.viabilizadorRepository.atualizarProduto(id, dados);
    return { ...toPublicProduto(atualizado), pendencias: pendenciasDe(atualizado) };
  }

  async enviarDocumento(id, tipo, arquivo, usuario) {
    if (!TIPOS_DOCUMENTO[tipo]) throw new AppError('VALIDATION_ERROR', 'Tipo de documento inválido.', 400, { tipo: 'Use book ou tabela.' });
    if (!arquivo) throw new AppError('VALIDATION_ERROR', 'Envie o arquivo PDF.', 400, { arquivo: 'Selecione um PDF.' });
    if (arquivo.mimetype !== 'application/pdf') throw new AppError('VALIDATION_ERROR', 'O arquivo precisa ser um PDF.', 400, { arquivo: 'Só PDF é aceito.' });

    const produto = await this._produtoDele(id, usuario);
    const url = await this.uploadService.uploadDocumento(produto.slug, tipo, arquivo);
    const atualizado = await this.viabilizadorRepository.atualizarProduto(id, {
      [TIPOS_DOCUMENTO[tipo]]: url,
      documentos_atualizados_em: new Date().toISOString(),
    });
    return { ...toPublicProduto(atualizado), pendencias: pendenciasDe(atualizado) };
  }

  async oportunidades(usuario, dias = 30) {
    const periodo = Number(dias);
    if (!PERIODOS.includes(periodo)) throw new AppError('VALIDATION_ERROR', 'Período inválido.', 400, { dias: 'Use 7, 30 ou 90.' });

    const desde = new Date(Date.now() - periodo * 86400000).toISOString();
    const { construtora, linhas: produtos } = await this._carteira(usuario);

    const linhas = await Promise.all(
      produtos.map(async (p) => {
        const [visualizacoes, leads, visitas, vendas] = await Promise.all([
          this.viabilizadorRepository.visualizacoes(p.id, desde),
          this.viabilizadorRepository.leads(p.id, desde),
          this.viabilizadorRepository.visitas(p.id, desde),
          this.viabilizadorRepository.vendas(p.id, desde),
        ]);
        const confirmadas = vendas.filter((v) => v.status === 'confirmada');
        return {
          ...toPublicProduto(p),
          pendencias: pendenciasDe(p),
          visualizacoes,
          leads,
          visitas,
          vendas: {
            confirmadas: confirmadas.length,
            pendentes: vendas.filter((v) => v.status === 'pendente').length,
            vgv: confirmadas.reduce((t, v) => t + Number(v.valor), 0),
          },
          pontuacao: visualizacoes * PESOS.visualizacoes + leads * PESOS.leads + visitas * PESOS.visitas,
        };
      }),
    );
    linhas.sort((a, b) => b.pontuacao - a.pontuacao);

    const soma = (campo) => linhas.reduce((t, l) => t + l[campo], 0);
    return {
      periodoDias: periodo,
      construtora: construtora ? { id: construtora.id, nome: construtora.nome } : null,
      resumo: {
        produtos: linhas.length,
        visualizacoes: soma('visualizacoes'),
        leads: soma('leads'),
        visitas: soma('visitas'),
        vgv: linhas.reduce((t, l) => t + l.vendas.vgv, 0),
      },
      produtos: linhas,
    };
  }
}

module.exports = { ViabilizadorService, toPublicProduto, pendenciasDe };
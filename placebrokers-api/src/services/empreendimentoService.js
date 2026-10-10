'use strict';

const { AppError } = require('../errors/AppError');

const STATUS_VALIDOS = ['lancamento', 'obras', 'pronto', 'outros'];

class EmpreendimentoService {
  /** @param {{ empreendimentoRepository, uploadService }} deps */
  constructor({ empreendimentoRepository, uploadService }) {
    this.empreendimentoRepository = empreendimentoRepository;
    this.uploadService = uploadService;
  }

  /** @param {{ cargo: string }|null} usuario */
  async listar(usuario) {
    const apenasPublicados = !usuario;
    const linhas = await this.empreendimentoRepository.listar({ apenasPublicados });
    return linhas.map((l) => this.sanitizar(l));
  }

  async buscarPorId(id, usuario) {
    const empreendimento = await this.empreendimentoRepository.buscarPorId(id);
    if (!empreendimento) throw new AppError('NOT_FOUND', 'Empreendimento não encontrado.');
    if (!empreendimento.publicado && !usuario) {
      throw new AppError('NOT_FOUND', 'Empreendimento não encontrado.');
    }
    return this.sanitizar(empreendimento);
  }

  sanitizar(row) {
    if (!row) return row;
    const { book_url: book, tabela_url: tabela, ...resto } = row;
    return { ...resto, tem_book: Boolean(book), tem_tabela: Boolean(tabela) };
  }

  async urlDoDocumento(id, tipo) {
    const COLUNAS = { book: 'book_url', tabela: 'tabela_url' };
    if (!COLUNAS[tipo]) throw new AppError('VALIDATION_ERROR', 'Tipo de documento inválido.', 400, { tipo: 'Use book ou tabela.' });
    const empreendimento = await this.empreendimentoRepository.buscarPorId(id);
    const guardado = empreendimento?.[COLUNAS[tipo]];
    if (!empreendimento || !guardado) throw new AppError('NOT_FOUND', 'Documento não disponível.');
    return this.uploadService.assinarDocumento(guardado);
  }

  validar(dados) {
    const erros = {};
    if (!dados.nome?.trim()) erros.nome = 'Informe o nome.';
    if (!STATUS_VALIDOS.includes(dados.status)) erros.status = 'Status inválido.';
    if (!dados.uf?.trim()) erros.uf = 'Informe o estado.';
    if (!dados.cidade?.trim()) erros.cidade = 'Informe a cidade.';
    if (!dados.bairro?.trim()) erros.bairro = 'Informe o bairro.';
    return erros;
  }

  /**
   * @param {object} dados
   * @param {{ capa?, galeria?, book?, tabela? }} arquivos
   */
  async criar(dados, arquivos) {
    const erros = this.validar(dados);
    if (Object.keys(erros).length) throw new AppError('VALIDATION_ERROR', 'Verifique os campos destacados.', erros);

    const slug = this.uploadService.gerarSlug(dados.nome);

    const [capaUrl, galeriaUrls, bookUrl, tabelaUrl] = await Promise.all([
      arquivos.capa ? this.uploadService.uploadImagem(slug, 'capa', arquivos.capa) : null,
      arquivos.galeria?.length ? this.uploadService.uploadGaleria(slug, arquivos.galeria) : [],
      arquivos.book ? this.uploadService.uploadDocumento(slug, 'book', arquivos.book) : null,
      arquivos.tabela ? this.uploadService.uploadDocumento(slug, 'tabela', arquivos.tabela) : null,
    ]);

    const empreendimento = await this.empreendimentoRepository.criar({
      nome: dados.nome,
      slug,
      construtora_id: dados.construtoraId || null,
      status: dados.status,
      descricao: dados.descricao || null,
      uf: dados.uf,
      cidade: dados.cidade,
      bairro: dados.bairro,
      endereco: dados.endereco || null,
      latitude: dados.latitude ?? null,
      longitude: dados.longitude ?? null,
      quartos_min: dados.quartosMin ?? null,
      quartos_max: dados.quartosMax ?? null,
      vagas_min: dados.vagasMin ?? null,
      vagas_max: dados.vagasMax ?? null,
      preco_min: dados.precoMin ?? null,
      preco_max: dados.precoMax ?? null,
      lazer: dados.lazer ?? [],
      capa_url: capaUrl,
      book_url: bookUrl,
      book_atualizado_em: bookUrl ? new Date().toISOString() : null,
      tabela_url: tabelaUrl,
      tabela_atualizado_em: tabelaUrl ? new Date().toISOString() : null,
      publicado: dados.publicado ?? false,
      disponivel: dados.disponivel ?? true,
    });

    if (galeriaUrls.length) {
      await this.empreendimentoRepository.inserirImagens(
        galeriaUrls.map((url, i) => ({ empreendimento_id: empreendimento.id, url, ordem: i })),
      );
    }

    return empreendimento;
  }

  async atualizar(id, m = {}) {
    const atual = await this.empreendimentoRepository.buscarPorId(id);
    if (!atual) throw new AppError('NOT_FOUND', 'Empreendimento não encontrado.');

    const MAPA = {
      nome: 'nome', construtoraId: 'construtora_id', status: 'status', descricao: 'descricao',
      uf: 'uf', cidade: 'cidade', bairro: 'bairro', endereco: 'endereco',
      latitude: 'latitude', longitude: 'longitude',
      quartosMin: 'quartos_min', quartosMax: 'quartos_max', vagasMin: 'vagas_min', vagasMax: 'vagas_max',
      precoMin: 'preco_min', precoMax: 'preco_max',
      lazer: 'lazer', publicado: 'publicado', disponivel: 'disponivel', destaque: 'destaque',
    };
    const dados = {};
    for (const [campo, coluna] of Object.entries(MAPA)) {
      if (m[campo] !== undefined) dados[coluna] = m[campo] === '' ? null : m[campo];
    }

    const erros = {};
    if ('nome' in dados && !String(dados.nome ?? '').trim()) erros.nome = 'Informe o nome.';
    if ('status' in dados && !STATUS_VALIDOS.includes(dados.status)) erros.status = 'Status inválido.';
    for (const c of ['uf', 'cidade', 'bairro']) {
      if (c in dados && !String(dados[c] ?? '').trim()) erros[c] = 'Campo obrigatório.';
    }
    for (const c of ['latitude', 'longitude', 'quartos_min', 'quartos_max', 'vagas_min', 'vagas_max', 'preco_min', 'preco_max']) {
      if (c in dados && dados[c] !== null && typeof dados[c] !== 'number') erros[c] = 'Informe um número.';
    }
    if (Object.keys(erros).length) throw new AppError('VALIDATION_ERROR', 'Verifique os campos destacados.', erros);
    if (Object.keys(dados).length === 0) throw new AppError('VALIDATION_ERROR', 'Nada para atualizar.');

    if (typeof dados.nome === 'string') dados.nome = dados.nome.trim();
    return this.sanitizar(await this.empreendimentoRepository.atualizar(id, dados));
  }
}

module.exports = { EmpreendimentoService };
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
    return this.empreendimentoRepository.listar({ apenasPublicados });
  }

  async buscarPorId(id, usuario) {
    const empreendimento = await this.empreendimentoRepository.buscarPorId(id);
    if (!empreendimento) throw new AppError('NOT_FOUND', 'Empreendimento não encontrado.');
    if (!empreendimento.publicado && !usuario) {
      throw new AppError('NOT_FOUND', 'Empreendimento não encontrado.');
    }
    return empreendimento;
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
   * @param {object}
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
    });

    if (galeriaUrls.length) {
      await this.empreendimentoRepository.inserirImagens(
        galeriaUrls.map((url, i) => ({ empreendimento_id: empreendimento.id, url, ordem: i })),
      );
    }

    return empreendimento;
  }
}

module.exports = { EmpreendimentoService };
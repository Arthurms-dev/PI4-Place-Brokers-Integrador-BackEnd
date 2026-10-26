'use strict';

const { AppError } = require('../errors/AppError');
const { randomUUID } = require('node:crypto');
const { normalizarNumeros, validarNumeros } = require('./validacaoEmpreendimento');

const STATUS_VALIDOS = ['lancamento', 'obras', 'pronto', 'outros'];
const CARGOS_INTERNOS = new Set(['admin', 'corretor', 'gerente']);
const CAMPOS_TIPOLOGIA = {
  quartos: 'quartos',
  suites: 'suites',
  vagas: 'vagas',
  areaM2: 'area_m2',
  ordem: 'ordem',
};

function usuarioPodeVerRascunhos(usuario) {
  return Boolean(
    usuario &&
    CARGOS_INTERNOS.has(usuario.cargo) &&
    usuario.ativo !== false &&
    !['pendente', 'recusado'].includes(usuario.status)
  );
}

class EmpreendimentoService {
  constructor({ empreendimentoRepository, uploadService }) {
    this.empreendimentoRepository = empreendimentoRepository;
    this.uploadService = uploadService;
    this._catalogoPublico = { value: null, expiresAt: 0, inflight: null, revision: 0 };
  }

  async listar(usuario) {
    const apenasPublicados = !usuarioPodeVerRascunhos(usuario);

    if (usuario != null || !apenasPublicados) {
      const linhas = await this.empreendimentoRepository.listar({ apenasPublicados });
      return linhas.map((linha) => this.sanitizar(linha));
    }

    const cache = this._catalogoPublico;
    if (cache.value !== null && Date.now() < cache.expiresAt) return cache.value;
    if (cache.inflight) return cache.inflight;

    const revision = cache.revision;
    const inflight = this.empreendimentoRepository
      .listar({ apenasPublicados: true })
      .then((linhas) => linhas.map((linha) => this.sanitizar(linha)));

    cache.inflight = inflight;

    try {
      const itens = await inflight;
      if (cache.revision === revision) {
        cache.value = itens;
        cache.expiresAt = Date.now() + 30_000;
      }
      return itens;
    } finally {
      if (cache.inflight === inflight) cache.inflight = null;
    }
  }

  invalidarCachePublico() {
    const cache = this._catalogoPublico;
    cache.value = null;
    cache.expiresAt = 0;
    cache.inflight = null;
    cache.revision += 1;
  }

  async buscarPorId(id, usuario) {
    const empreendimento = await this.empreendimentoRepository.buscarPorId(id);
    if (!empreendimento) throw new AppError('NOT_FOUND', 'Empreendimento não encontrado.');
    if (!empreendimento.publicado && !usuarioPodeVerRascunhos(usuario)) {
      throw new AppError('NOT_FOUND', 'Empreendimento não encontrado.');
    }
    return this.sanitizar(empreendimento);
  }

  sanitizar(row) {
    if (!row) return row;

    const { book_url: book, tabela_url: tabela, ...dados } = row;
    const tipologias = Array.isArray(dados.tipologias)
      ? [...dados.tipologias].sort(
          (a, b) =>
            (a.ordem ?? 0) - (b.ordem ?? 0) ||
            a.nome.localeCompare(b.nome, 'pt-BR')
        )
      : [];

    return {
      ...dados,
      tipologias,
      tem_book: Boolean(book),
      tem_tabela: Boolean(tabela),
    };
  }

  async urlDoDocumento(id, tipo, usuario = null) {
    const COLUNAS = { book: 'book_url', tabela: 'tabela_url' };
    if (!COLUNAS[tipo]) {
      throw new AppError('VALIDATION_ERROR', 'Tipo de documento inválido.', 400, {
        tipo: 'Use book ou tabela.',
      });
    }

    const empreendimento = await this.empreendimentoRepository.buscarPorId(id);
    const guardado = empreendimento?.[COLUNAS[tipo]];

    if (
      !empreendimento ||
      (!empreendimento.publicado && !usuarioPodeVerRascunhos(usuario)) ||
      !guardado
    ) {
      throw new AppError('NOT_FOUND', 'Documento não disponível.');
    }

    if (/^https:\/\/drive\.google\.com\/file\/d\/[A-Za-z0-9_-]+\/view(?:\?.*)?$/.test(guardado)) {
      return { url: guardado, expiraEmSegundos: null };
    }

    return this.uploadService.assinarDocumento(guardado);
  }

  validar(dados) {
    const erros = {};
    if (typeof dados.nome !== 'string' || !dados.nome.trim()) erros.nome = 'Informe o nome.';
    if (!STATUS_VALIDOS.includes(dados.status)) erros.status = 'Status inválido.';
    if (typeof dados.uf !== 'string' || !dados.uf.trim()) erros.uf = 'Informe o estado.';
    if (typeof dados.cidade !== 'string' || !dados.cidade.trim()) erros.cidade = 'Informe a cidade.';
    if (typeof dados.bairro !== 'string' || !dados.bairro.trim()) erros.bairro = 'Informe o bairro.';
    Object.assign(erros, validarNumeros(dados));
    return erros;
  }

  async criar(dados, arquivos = {}) {
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
      throw new AppError('VALIDATION_ERROR', 'Informe os dados do empreendimento.');
    }
    dados = normalizarNumeros(dados);
    const erros = this.validar(dados);
    if (Object.keys(erros).length) {
      throw new AppError('VALIDATION_ERROR', 'Verifique os campos destacados.', erros);
    }

    const slug = this.uploadService.gerarSlug(dados.nome);

    const temArquivos = arquivos.capa || arquivos.book || arquivos.tabela || arquivos.galeria?.length;
    const lote = temArquivos
      ? await this.uploadService.uploadCadastro(slug, arquivos)
      : { capaUrl: null, galeriaUrls: [], bookUrl: null, tabelaUrl: null, arquivos: [] };
    const { capaUrl, galeriaUrls, bookUrl, tabelaUrl } = lote;
    // Conhecer o ID antes do INSERT permite conferir uma resposta perdida sem
    // procurar por nome e arriscar remover um cadastro anterior com o mesmo slug.
    const idCriacao = randomUUID();
    let empreendimento = null;

    try {
      empreendimento = await this.empreendimentoRepository.criar({
        id: idCriacao,
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
        area_min: dados.areaMin ?? null,
        area_max: dados.areaMax ?? null,
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
          galeriaUrls.map((url, i) => ({ empreendimento_id: empreendimento.id, url, ordem: i }))
        );
      }

      this.invalidarCachePublico();
      return empreendimento;
    } catch (erro) {
      this.invalidarCachePublico();
      const recusadoPeloBanco = !empreendimento && /^(?:22|23|42)[A-Z0-9]{3}$/.test(erro?.code ?? '');
      if (!recusadoPeloBanco) {
        // Timeout não prova que o INSERT falhou. Se não for possível confirmar
        // e desfazer o cadastro desta tentativa, preservar todos os arquivos.
        let confirmado = empreendimento;
        if (!confirmado) {
          try { confirmado = await this.empreendimentoRepository.buscarPorId(idCriacao); }
          catch { /* a mensagem abaixo exige conferência manual */ }
        }
        let removido = null;
        if (confirmado?.id === idCriacao) {
          try { removido = await this.empreendimentoRepository.removerCriacaoIncompleta(idCriacao); }
          catch { /* não apagar arquivos que ainda podem estar em uso */ }
        }
        if (removido?.id !== idCriacao) {
          throw new AppError('CREATE_UNCONFIRMED',
            'Não foi possível confirmar a conclusão do cadastro. Atualize a lista de empreendimentos e confira se ele já aparece antes de reenviar. Os arquivos foram preservados para conferência.',
            500, { empreendimentoId: idCriacao });
        }
      }
      if (lote.arquivos.length) {
        await this.uploadService.limparArquivosNovos(lote.arquivos).catch(() => {
          console.error('Falha ao limpar arquivos novos após cadastro recusado ou desfeito.');
        });
      }
      if (erro?.code === '23505') {
        throw new AppError('CONFLICT', 'Já existe um empreendimento com esse nome. Confira o cadastro existente.', 409,
          { nome: 'Este nome já foi cadastrado.' });
      }
      throw erro;
    }
  }

  async atualizar(id, mudancas = {}) {
    if (!mudancas || typeof mudancas !== 'object' || Array.isArray(mudancas)) {
      throw new AppError('VALIDATION_ERROR', 'Informe os dados do empreendimento.');
    }
    mudancas = normalizarNumeros(mudancas);
    const atual = await this.empreendimentoRepository.buscarPorId(id);
    if (!atual) throw new AppError('NOT_FOUND', 'Empreendimento não encontrado.');

    const MAPA = {
      nome: 'nome',
      construtoraId: 'construtora_id',
      status: 'status',
      descricao: 'descricao',
      uf: 'uf',
      cidade: 'cidade',
      bairro: 'bairro',
      endereco: 'endereco',
      latitude: 'latitude',
      longitude: 'longitude',
      quartosMin: 'quartos_min',
      quartosMax: 'quartos_max',
      vagasMin: 'vagas_min',
      vagasMax: 'vagas_max',
      areaMin: 'area_min',
      areaMax: 'area_max',
      precoMin: 'preco_min',
      precoMax: 'preco_max',
      lazer: 'lazer',
      publicado: 'publicado',
      disponivel: 'disponivel',
      destaque: 'destaque',
    };

    const dados = {};
    for (const [campo, coluna] of Object.entries(MAPA)) {
      if (mudancas[campo] !== undefined) {
        dados[coluna] = mudancas[campo] === '' ? null : mudancas[campo];
      }
    }

    const erros = {};
    if ('nome' in dados && (typeof dados.nome !== 'string' || !dados.nome.trim())) erros.nome = 'Informe o nome.';
    if ('status' in dados && !STATUS_VALIDOS.includes(dados.status)) erros.status = 'Status inválido.';

    for (const campo of ['uf', 'cidade', 'bairro']) {
      if (campo in dados && (typeof dados[campo] !== 'string' || !dados[campo].trim())) {
        erros[campo] = 'Campo obrigatório.';
      }
    }

    Object.assign(erros, validarNumeros(mudancas, atual));

    if (Object.keys(erros).length) {
      throw new AppError('VALIDATION_ERROR', 'Verifique os campos destacados.', erros);
    }
    if (Object.keys(dados).length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Nada para atualizar.');
    }

    if (typeof dados.nome === 'string') dados.nome = dados.nome.trim();

    const atualizado = await this.empreendimentoRepository.atualizar(id, dados);
    this.invalidarCachePublico();
    return this.sanitizar(atualizado);
  }

  validarTipologia(entrada, atual = null) {
    if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada) ||
        Object.keys(entrada).length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Informe os dados da tipologia.');
    }

    const dados = {};
    const erros = {};

    for (const campo of Object.keys(entrada)) {
      if (campo !== 'nome' && !Object.hasOwn(CAMPOS_TIPOLOGIA, campo)) {
        erros[campo] = 'Campo não permitido.';
      }
    }

    if (Object.hasOwn(entrada, 'nome')) {
      if (typeof entrada.nome !== 'string' ||
          entrada.nome.trim().length < 2 || entrada.nome.trim().length > 120) {
        erros.nome = 'Informe um nome entre 2 e 120 caracteres.';
      } else {
        dados.nome = entrada.nome.trim();
      }
    } else if (!atual) {
      erros.nome = 'Informe o nome da tipologia.';
    }

    for (const [campo, coluna] of Object.entries(CAMPOS_TIPOLOGIA)) {
      if (!Object.hasOwn(entrada, campo)) continue;

      const valor = entrada[campo];
      if (valor === null && campo !== 'ordem') {
        dados[coluna] = null;
        continue;
      }

      if (typeof valor !== 'number' || !Number.isFinite(valor)) {
        erros[campo] = 'Informe um número válido.';
        continue;
      }

      if (campo === 'areaM2') {
        if (valor <= 0 || valor > 999999.99 ||
            Math.abs(valor - Math.round(valor * 100) / 100) > 0.000001) {
          erros[campo] = 'Informe uma área válida com até 2 casas decimais.';
        } else {
          dados[coluna] = valor;
        }
      } else if (!Number.isInteger(valor) || valor < 0 || valor > 32767) {
        erros[campo] = 'Informe um número inteiro válido.';
      } else {
        dados[coluna] = valor;
      }
    }

    const resultado = { ...atual, ...dados };
    if (resultado.quartos != null && resultado.suites != null &&
        resultado.suites > resultado.quartos) {
      erros.suites = 'Suítes não podem superar os quartos.';
    }

    if (Object.keys(erros).length) {
      throw new AppError('VALIDATION_ERROR', 'Verifique os campos destacados.', erros);
    }

    return dados;
  }

  async criarTipologia(empreendimentoId, entrada) {
    const dados = this.validarTipologia(entrada);
    const empreendimento = await this.empreendimentoRepository.buscarPorId(empreendimentoId);
    if (!empreendimento) throw new AppError('NOT_FOUND', 'Empreendimento não encontrado.');

    try {
      const tipologia = await this.empreendimentoRepository.criarTipologia(empreendimentoId, dados);
      this.invalidarCachePublico();
      return tipologia;
    } catch (erro) {
      if (erro.code === '23505') {
        throw new AppError('VALIDATION_ERROR', 'Já existe uma tipologia com esse nome.', {
          nome: 'Escolha outro nome.',
        });
      }
      throw erro;
    }
  }

  async atualizarTipologia(empreendimentoId, tipologiaId, entrada) {
    const atual = await this.empreendimentoRepository.buscarTipologia(empreendimentoId, tipologiaId);
    if (!atual) throw new AppError('NOT_FOUND', 'Tipologia não encontrada.');

    const dados = this.validarTipologia(entrada, atual);

    try {
      const tipologia = await this.empreendimentoRepository.atualizarTipologia(
        empreendimentoId,
        tipologiaId,
        dados
      );
      if (!tipologia) throw new AppError('NOT_FOUND', 'Tipologia não encontrada.');
      this.invalidarCachePublico();
      return tipologia;
    } catch (erro) {
      if (erro.code === '23505') {
        throw new AppError('VALIDATION_ERROR', 'Já existe uma tipologia com esse nome.', {
          nome: 'Escolha outro nome.',
        });
      }
      throw erro;
    }
  }
}

module.exports = { EmpreendimentoService, usuarioPodeVerRascunhos };

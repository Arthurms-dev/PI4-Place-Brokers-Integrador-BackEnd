'use strict';

const { EmpreendimentoService } = require('../services/empreendimentoService');
const { EmpreendimentoRepository } = require('../repositories/empreendimentoRepository');
const { UploadService } = require('../services/uploadService');
const { AppError } = require('../errors/AppError');
const { EmpreendimentoImagensService } = require('../services/empreendimentoImagensService');
const { numeroDoFormulario } = require('../services/validacaoEmpreendimento');

const empreendimentoService = new EmpreendimentoService({
  empreendimentoRepository: new EmpreendimentoRepository(),
  uploadService: new UploadService(),
});

const imagemService = new EmpreendimentoImagensService({
  repository: new EmpreendimentoRepository(),
  uploadService: new UploadService(),
  invalidarCache: () => empreendimentoService.invalidarCachePublico(),
});

async function trocarCapa(req, res) {
  try {
    return res.status(200).json(await imagemService.trocarCapa(req.params.id, req.file));
  } catch (erro) { return handleError(res, erro); }
}
async function adicionarFotos(req, res) {
  try {
    return res.status(201).json(await imagemService.adicionarGaleria(req.params.id, req.files));
  } catch (erro) { return handleError(res, erro); }
}
async function removerFoto(req, res) {
  try {
    return res.status(200).json(await imagemService.removerFoto(req.params.id, req.params.imagemId));
  } catch (erro) { return handleError(res, erro); }
}

async function listar(req, res) {
  try {
    return res.status(200).json(await empreendimentoService.listar(req.user));
  } catch (err) {
    return handleError(res, err);
  }
}

async function buscarPorId(req, res) {
  try {
    return res.status(200).json(await empreendimentoService.buscarPorId(req.params.id, req.user));
  } catch (err) {
    return handleError(res, err);
  }
}

async function criar(req, res) {
  try {
    const arquivos = req.files ?? {};
    const b = req.body;
    const dados = {
      ...b,
      lazer: b.lazer ? JSON.parse(b.lazer) : [],
      publicado: b.publicado === 'true',
      disponivel: b.disponivel !== 'false',
      quartosMin: numeroDoFormulario(b.quartosMin),
      quartosMax: numeroDoFormulario(b.quartosMax),
      vagasMin: numeroDoFormulario(b.vagasMin),
      vagasMax: numeroDoFormulario(b.vagasMax),
      areaMin: numeroDoFormulario(b.areaMin),
      areaMax: numeroDoFormulario(b.areaMax),
      precoMin: numeroDoFormulario(b.precoMin),
      precoMax: numeroDoFormulario(b.precoMax),
      latitude: numeroDoFormulario(b.latitude),
      longitude: numeroDoFormulario(b.longitude),
    };

    const resultado = await empreendimentoService.criar(dados, {
      capa: arquivos.capa?.[0],
      galeria: arquivos.galeria,
      book: arquivos.book?.[0],
      tabela: arquivos.tabela?.[0],
    });

    return res.status(201).json(empreendimentoService.sanitizar(resultado));
  } catch (err) {
    return handleError(res, err);
  }
}

async function documento(req, res) {
  try {
    return res.status(200).json(
      await empreendimentoService.urlDoDocumento(req.params.id, req.params.tipo, req.user)
    );
  } catch (err) {
    return handleError(res, err);
  }
}

async function atualizar(req, res) {
  try {
    return res.status(200).json(await empreendimentoService.atualizar(req.params.id, req.body));
  } catch (err) {
    return handleError(res, err);
  }
}

async function criarTipologia(req, res) {
  try {
    const dados = await empreendimentoService.criarTipologia(req.params.id, req.body);
    return res.status(201).json(dados);
  } catch (err) {
    return handleError(res, err);
  }
}

async function atualizarTipologia(req, res) {
  try {
    const dados = await empreendimentoService.atualizarTipologia(
      req.params.id,
      req.params.tipologiaId,
      req.body
    );
    return res.status(200).json(dados);
  } catch (err) {
    return handleError(res, err);
  }
}

function handleError(res, err) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
      fieldErrors: err.fieldErrors,
    });
  }

  console.error(err);
  return res.status(500).json({ code: 'SERVER_ERROR', message: 'Erro interno do servidor.' });
}

module.exports = {
  listar,
  buscarPorId,
  criar,
  atualizar,
  documento,
  criarTipologia,
  atualizarTipologia,
  trocarCapa,
  adicionarFotos,
  removerFoto,
};

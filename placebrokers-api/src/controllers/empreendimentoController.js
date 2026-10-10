'use strict';

const { EmpreendimentoService } = require('../services/empreendimentoService');
const { EmpreendimentoRepository } = require('../repositories/empreendimentoRepository');
const { UploadService } = require('../services/uploadService');
const { AppError } = require('../errors/AppError');

const empreendimentoService = new EmpreendimentoService({
  empreendimentoRepository: new EmpreendimentoRepository(),
  uploadService: new UploadService(),
});

function paraNumero(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = Number(valor);
  return Number.isNaN(n) ? null : n;
}

async function listar(req, res) {
  try {
    const dados = await empreendimentoService.listar(req.user);
    return res.status(200).json(dados);
  } catch (err) {
    return handleError(res, err);
  }
}

async function buscarPorId(req, res) {
  try {
    const dados = await empreendimentoService.buscarPorId(req.params.id, req.user);
    return res.status(200).json(dados);
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
      quartosMin: paraNumero(b.quartosMin),
      quartosMax: paraNumero(b.quartosMax),
      vagasMin: paraNumero(b.vagasMin),
      vagasMax: paraNumero(b.vagasMax),
      precoMin: paraNumero(b.precoMin),
      precoMax: paraNumero(b.precoMax),
      latitude: paraNumero(b.latitude),
      longitude: paraNumero(b.longitude),
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
    return res.status(200).json(await empreendimentoService.urlDoDocumento(req.params.id, req.params.tipo));
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

function handleError(res, err) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ code: err.code, message: err.message, fieldErrors: err.fieldErrors });
  }
  console.error(err);
  return res.status(500).json({ code: 'SERVER_ERROR', message: 'Erro interno do servidor.' });
}

module.exports = { listar, buscarPorId, criar, atualizar, documento };
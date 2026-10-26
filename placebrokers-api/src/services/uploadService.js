'use strict';

const sharp = require('sharp');
const { randomUUID } = require('node:crypto');
const { AppError } = require('../errors/AppError');
const { validarImagem } = require('./empreendimentoImagensService');
const { supabaseAdmin } = require('../config/supabase');

const BUCKET_IMAGENS = 'empreendimentos';
const BUCKET_DOCUMENTOS = 'documentos';
const LARGURA_MAXIMA = 1600;
const QUALIDADE_WEBP = 78;

function gerarSlug(nome) {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function subirNovo(bucket, caminho, buffer, contentType) {
  const storage = supabaseAdmin.storage.from(bucket);
  const { data } = storage.getPublicUrl(caminho);
  if (!data?.publicUrl) throw new AppError('SERVER_ERROR', 'Não foi possível preparar o arquivo.');
  const { error } = await storage.upload(caminho, buffer, { upsert: false, contentType, cacheControl: '3600' });
  if (error) throw error;
  return { url: data.publicUrl, caminho, bucket };
}

function validarPdf(arquivo) {
  if (!arquivo || !Buffer.isBuffer(arquivo.buffer) || arquivo.buffer.length === 0 ||
      arquivo.buffer.length > 15 * 1024 * 1024 || arquivo.mimetype !== 'application/pdf' ||
      arquivo.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new AppError('VALIDATION_ERROR', 'Envie um arquivo PDF válido de até 15 MB.');
  }
}

class UploadService {
  gerarSlug(nome) {
    return gerarSlug(nome);
  }

  /** @param {string} slug @param {string} nomeArquivo @param {{buffer: Buffer}} arquivo */
  async uploadImagem(slug, nomeArquivo, arquivo) {
    return (await this.uploadImagemNova(slug, nomeArquivo, arquivo)).url;
  }

  /** @param {string} slug @param {{buffer: Buffer}[]} arquivos */
  async uploadGaleria(slug, arquivos) {
    return (await this.uploadCadastro(slug, { galeria: arquivos })).galeriaUrls;
  }

  async uploadImagemNova(empreendimentoId, grupo, arquivo) {
    validarImagem(arquivo);
    // Não reutilizar os caminhos da criação antiga: cada upload deve ser imutável.
    const info = await sharp(arquivo.buffer, { limitInputPixels: 40_000_000 })
      .metadata().catch(() => null);
    if (!info || !['jpeg', 'png', 'webp'].includes(info.format)) {
      throw new AppError('VALIDATION_ERROR', 'Arquivo inválido. Use JPG, PNG ou WebP.');
    }
    const buffer = await sharp(arquivo.buffer, { limitInputPixels: 40_000_000 })
      .resize({ width: LARGURA_MAXIMA, withoutEnlargement: true })
      .webp({ quality: QUALIDADE_WEBP }).toBuffer();
    const caminho = empreendimentoId + '/' + grupo + '/' + randomUUID() + '.webp';
    return subirNovo(BUCKET_IMAGENS, caminho, buffer, 'image/webp');
  }

  async limparImagensNovas(caminhos) {
    if (!caminhos.length) return;
    const { error } = await supabaseAdmin.storage.from(BUCKET_IMAGENS).remove(caminhos);
    if (error) throw error;
  }

  async uploadDocumento(slug, nomeArquivo, arquivo) {
    return (await this.uploadDocumentoNovo(slug, nomeArquivo, arquivo)).url;
  }

  async uploadDocumentoNovo(slug, tipo, arquivo) {
    if (!['book', 'tabela'].includes(tipo)) throw new AppError('VALIDATION_ERROR', 'Tipo de documento inválido.');
    validarPdf(arquivo);
    return subirNovo(BUCKET_DOCUMENTOS, `${slug}/documentos/${tipo}-${randomUUID()}.pdf`, arquivo.buffer, 'application/pdf');
  }

  async limparArquivosNovos(arquivos) {
    // Recebe somente o manifesto de uploads concluídos desta tentativa.
    const grupos = new Map();
    for (const arquivo of arquivos) {
      if (![BUCKET_IMAGENS, BUCKET_DOCUMENTOS].includes(arquivo.bucket) ||
          typeof arquivo.caminho !== 'string' || !arquivo.caminho) {
        throw new Error('Manifesto de limpeza inválido.');
      }
      const caminhos = grupos.get(arquivo.bucket) ?? [];
      caminhos.push(arquivo.caminho);
      grupos.set(arquivo.bucket, caminhos);
    }
    const resultados = await Promise.allSettled([...grupos].map(async ([bucket, caminhos]) => {
      const { error } = await supabaseAdmin.storage.from(bucket).remove(caminhos);
      if (error) throw error;
    }));
    const falhas = resultados.filter((r) => r.status === 'rejected');
    if (falhas.length) throw new AggregateError(falhas.map((r) => r.reason), 'Falha ao limpar arquivos novos.');
  }

  async uploadCadastro(slug, arquivos) {
    const galeria = arquivos.galeria ?? [];
    if (!Array.isArray(galeria) || galeria.length > 20) {
      throw new AppError('VALIDATION_ERROR', 'A galeria permite no máximo 20 fotos.');
    }
    [...(arquivos.capa ? [arquivos.capa] : []), ...galeria].forEach(validarImagem);
    if (arquivos.book) validarPdf(arquivos.book);
    if (arquivos.tabela) validarPdf(arquivos.tabela);

    const prefixo = `${slug}/cadastros/${randomUUID()}`;
    const lote = { capaUrl: null, galeriaUrls: [], bookUrl: null, tabelaUrl: null, arquivos: [] };
    const registrar = (novo) => { lote.arquivos.push(novo); return novo.url; };
    try {
      // Sequencial: nenhum upload continua em segundo plano depois de uma falha.
      if (arquivos.capa) lote.capaUrl = registrar(await this.uploadImagemNova(prefixo, 'capas', arquivos.capa));
      for (const foto of galeria) lote.galeriaUrls.push(registrar(await this.uploadImagemNova(prefixo, 'galeria', foto)));
      if (arquivos.book) lote.bookUrl = registrar(await this.uploadDocumentoNovo(prefixo, 'book', arquivos.book));
      if (arquivos.tabela) lote.tabelaUrl = registrar(await this.uploadDocumentoNovo(prefixo, 'tabela', arquivos.tabela));
      return lote;
    } catch (erro) {
      await this.limparArquivosNovos(lote.arquivos).catch(() => {
        console.error('Falha ao limpar arquivos novos de um cadastro interrompido.');
      });
      throw erro;
    }
  }

  /**
   */
  async assinarDocumento(urlOuCaminho, segundos = 600) {
    const marca = `/${BUCKET_DOCUMENTOS}/`;
    const i = urlOuCaminho.indexOf(marca);
    const caminho = (i >= 0 ? urlOuCaminho.slice(i + marca.length) : urlOuCaminho).split('?')[0];
    const { data, error } = await supabaseAdmin.storage.from(BUCKET_DOCUMENTOS).createSignedUrl(decodeURIComponent(caminho), segundos);
    if (error) throw error;
    return { url: data.signedUrl, expiraEmSegundos: segundos };
  }
}

module.exports = { UploadService };

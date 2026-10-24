'use strict';

const sharp = require('sharp');
const { randomUUID } = require('node:crypto');
const { AppError } = require('../errors/AppError');
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

async function comprimir(buffer) {
  return sharp(buffer)
    .resize({ width: LARGURA_MAXIMA, withoutEnlargement: true })
    .webp({ quality: QUALIDADE_WEBP })
    .toBuffer();
}

async function subir(bucket, path, buffer, contentType) {
  const { error } = await supabaseAdmin.storage.from(bucket).upload(path, buffer, { upsert: true, contentType, cacheControl: '3600' });
  if (error) throw error;
  const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

class UploadService {
  gerarSlug(nome) {
    return gerarSlug(nome);
  }

  /** @param {string} slug @param {string} nomeArquivo @param {{buffer: Buffer}} arquivo */
  async uploadImagem(slug, nomeArquivo, arquivo) {
    const buffer = await comprimir(arquivo.buffer);
    return subir(BUCKET_IMAGENS, `${slug}/${nomeArquivo}.webp`, buffer, 'image/webp');
  }

  /** @param {string} slug @param {{buffer: Buffer}[]} arquivos */
  async uploadGaleria(slug, arquivos) {
    const urls = [];
    for (let i = 0; i < arquivos.length; i++) {
      const buffer = await comprimir(arquivos[i].buffer);
      const nome = `${String(i + 1).padStart(2, '0')}.webp`;
      urls.push(await subir(BUCKET_IMAGENS, `${slug}/galeria/${nome}`, buffer, 'image/webp'));
    }
    return urls;
  }

  async uploadImagemNova(empreendimentoId, grupo, arquivo) {
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
    const { error } = await supabaseAdmin.storage.from(BUCKET_IMAGENS)
      .upload(caminho, buffer, { upsert: false, contentType: 'image/webp', cacheControl: '3600' });
    if (error) throw error;
    const { data } = supabaseAdmin.storage.from(BUCKET_IMAGENS).getPublicUrl(caminho);
    return { url: data.publicUrl, caminho };
  }

  async limparImagensNovas(caminhos) {
    if (!caminhos.length) return;
    const { error } = await supabaseAdmin.storage.from(BUCKET_IMAGENS).remove(caminhos);
    if (error) throw error;
  }

  async uploadDocumento(slug, nomeArquivo, arquivo) {
    return subir(BUCKET_DOCUMENTOS, `${slug}/${nomeArquivo}.pdf`, arquivo.buffer, 'application/pdf');
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
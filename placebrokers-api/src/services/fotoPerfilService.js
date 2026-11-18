'use strict';

const sharp = require('sharp');
const { randomUUID } = require('node:crypto');
const { AppError } = require('../errors/AppError');

const BUCKET_AVATARES = 'avatares';
const TAMANHO_MAXIMO_ENVIO = 5 * 1024 * 1024;
const LADO = 256;
const TIPOS_ACEITOS = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Foto de perfil: cada usuário troca a própria em Configurações.
 * A imagem é recortada em quadrado de 256 px e salva em WebP (fica com poucos KB).
 */
class FotoPerfilService {
  /**
   * @param {{ storage: { subir: (caminho: string, buffer: Buffer) => Promise<void>, remover: (caminhos: string[]) => Promise<void>, urlPublica: (caminho: string) => string },
   *           profileRepository: { atualizar: (id: string, dados: object) => Promise<object> },
   *           processar?: (buffer: Buffer) => Promise<Buffer> }} deps
   */
  constructor({ storage, profileRepository, processar = processarFoto }) {
    this.storage = storage;
    this.profileRepository = profileRepository;
    this.processar = processar;
  }

  /** @param {{ id: string, avatar_url?: string|null }} usuario @param {{ buffer: Buffer, mimetype: string }|undefined} arquivo */
  async trocar(usuario, arquivo) {
    if (!arquivo?.buffer?.length) throw erroFoto('Escolha uma foto.');
    if (!TIPOS_ACEITOS.has(arquivo.mimetype)) throw erroFoto('Use uma foto JPG, PNG ou WebP.');
    if (arquivo.buffer.length > TAMANHO_MAXIMO_ENVIO) throw erroFoto('A foto passa de 5 MB.');

    let imagem;
    try {
      imagem = await this.processar(arquivo.buffer);
    } catch {
      // Arquivo com extensão de imagem, mas que não é imagem de verdade.
      throw erroFoto('Não foi possível ler essa imagem. Tente outra foto.');
    }

    const caminho = `${usuario.id}/${randomUUID()}.webp`;
    await this.storage.subir(caminho, imagem);
    const avatarUrl = this.storage.urlPublica(caminho);
    try {
      await this.profileRepository.atualizar(usuario.id, { avatar_url: avatarUrl });
    } catch (err) {
      await this.storage.remover([caminho]).catch(() => {});
      throw err;
    }
    await this.removerAntiga(usuario);
    return { avatarUrl };
  }

  async remover(usuario) {
    await this.profileRepository.atualizar(usuario.id, { avatar_url: null });
    await this.removerAntiga(usuario);
    return { avatarUrl: null };
  }

  /** Só apaga arquivo que está na pasta do próprio usuário dentro do bucket de avatares. */
  async removerAntiga(usuario) {
    const caminho = caminhoNoBucket(usuario.avatar_url, usuario.id);
    if (caminho) await this.storage.remover([caminho]).catch(() => {});
  }
}

function erroFoto(mensagem) {
  return new AppError('VALIDATION_ERROR', mensagem, { foto: mensagem });
}

function caminhoNoBucket(url, userId) {
  const marca = `/storage/v1/object/public/${BUCKET_AVATARES}/`;
  const i = typeof url === 'string' ? url.indexOf(marca) : -1;
  if (i < 0) return null;
  const caminho = decodeURIComponent(url.slice(i + marca.length).split('?')[0]);
  return caminho.startsWith(`${userId}/`) && !caminho.includes('..') ? caminho : null;
}

async function processarFoto(buffer) {
  return sharp(buffer, { limitInputPixels: 40_000_000 })
    .rotate() // respeita a orientação da foto tirada no celular
    .resize(LADO, LADO, { fit: 'cover', position: 'attention' })
    .webp({ quality: 80 })
    .toBuffer();
}

/** Acesso real ao Supabase Storage (bucket público: a URL da foto vai direto no <img>). */
function storageSupabase() {
  const { supabaseAdmin } = require('../config/supabase');
  const bucket = () => supabaseAdmin.storage.from(BUCKET_AVATARES);
  return {
    async subir(caminho, buffer) {
      const { error } = await bucket().upload(caminho, buffer, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
      if (error) throw error;
    },
    async remover(caminhos) {
      const { error } = await bucket().remove(caminhos);
      if (error) throw error;
    },
    urlPublica(caminho) {
      return bucket().getPublicUrl(caminho).data.publicUrl;
    },
  };
}

module.exports = { FotoPerfilService, storageSupabase, processarFoto, caminhoNoBucket, BUCKET_AVATARES, TAMANHO_MAXIMO_ENVIO };

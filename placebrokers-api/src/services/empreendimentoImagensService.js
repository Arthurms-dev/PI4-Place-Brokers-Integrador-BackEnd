'use strict';

const { AppError } = require('../errors/AppError');
const MAX_ARQUIVO = 15 * 1024 * 1024;
const MAX_FOTOS = 20;
const MAX_ENVIO = 5;
const MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

function validarImagem(file) {
  if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) {
    throw new AppError('VALIDATION_ERROR', 'Selecione uma imagem válida.', { imagem: 'Arquivo ausente.' });
  }
  if (!MIME.has(file.mimetype)) {
    throw new AppError('VALIDATION_ERROR', 'Use JPG, PNG ou WebP.', { imagem: 'Formato inválido.' });
  }
  if (file.buffer.length > MAX_ARQUIVO) {
    throw new AppError('VALIDATION_ERROR', 'A imagem deve ter até 15 MB.', { imagem: 'Arquivo muito grande.' });
  }
}

class EmpreendimentoImagensService {
  constructor({ repository, uploadService, invalidarCache = () => {} }) {
    this.repository = repository;
    this.uploadService = uploadService;
    this.invalidarCache = invalidarCache;
  }

  async buscarOuFalhar(id) {
    const atual = await this.repository.buscarPorId(id);
    if (!atual) throw new AppError('NOT_FOUND', 'Empreendimento não encontrado.');
    return atual;
  }

  async trocarCapa(id, arquivo) {
    validarImagem(arquivo);
    await this.buscarOuFalhar(id);
    const novo = await this.uploadService.uploadImagemNova(id, 'capas', arquivo);
    try {
      const atualizado = await this.repository.atualizar(id, { capa_url: novo.url });
      if (!atualizado) throw new AppError('NOT_FOUND', 'Empreendimento não encontrado.');
      this.invalidarCache();
      return { capa_url: novo.url };
    } catch (erro) {
      await this.uploadService.limparImagensNovas([novo.caminho]).catch(() => {});
      throw erro;
    }
  }

  async adicionarGaleria(id, arquivos) {
    if (!Array.isArray(arquivos) || arquivos.length === 0 || arquivos.length > MAX_ENVIO) {
      throw new AppError('VALIDATION_ERROR', 'Envie de 1 a 5 fotos por vez.', { imagens: 'Quantidade inválida.' });
    }
    arquivos.forEach(validarImagem);
    const atual = await this.buscarOuFalhar(id);
    const existentes = Array.isArray(atual.imagens) ? atual.imagens : [];
    if (existentes.length + arquivos.length > MAX_FOTOS) {
      throw new AppError('VALIDATION_ERROR', 'A galeria permite no máximo 20 fotos.', { imagens: 'Limite atingido.' });
    }
    const ultimaOrdem = Math.max(-1, ...existentes.map(f => Number(f.ordem) || 0));
    const enviados = [];
    try {
      for (const arquivo of arquivos) {
        enviados.push(await this.uploadService.uploadImagemNova(id, 'galeria', arquivo));
      }
      const linhas = enviados.map((novo, i) => ({
        empreendimento_id: id, url: novo.url, ordem: ultimaOrdem + i + 1,
      }));
      const adicionadas = await this.repository.adicionarImagens(linhas);
      this.invalidarCache();
      return { imagens: adicionadas };
    } catch (erro) {
      await this.uploadService.limparImagensNovas(enviados.map(f => f.caminho)).catch(() => {});
      throw erro;
    }
  }

  async removerFoto(id, imagemId) {
    await this.buscarOuFalhar(id);
    const removida = await this.repository.removerImagem(id, imagemId);
    if (!removida) throw new AppError('NOT_FOUND', 'Foto não encontrada neste empreendimento.');
    // Remover apenas o registro. Não apagar o arquivo do Storage nesta versão.
    this.invalidarCache();
    return { id: removida.id, removida: true };
  }
}

module.exports = { EmpreendimentoImagensService, validarImagem, MAX_ENVIO, MAX_FOTOS };

'use strict';

const sharp = require('sharp');
const { FotoPerfilService, processarFoto, caminhoNoBucket } = require('./fotoPerfilService');

const URL_BASE = 'https://x.supabase.co/storage/v1/object/public/avatares/';
let pngGrande;
beforeAll(async () => {
  pngGrande = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#c9a54c' } }).png().toBuffer();
});

function montar() {
  const storage = {
    subir: jest.fn().mockResolvedValue(),
    remover: jest.fn().mockResolvedValue(),
    urlPublica: jest.fn((c) => URL_BASE + c),
  };
  const profileRepository = { atualizar: jest.fn().mockResolvedValue({}) };
  return { storage, profileRepository, service: new FotoPerfilService({ storage, profileRepository }) };
}

test('processa em quadrado de 256 px WebP', async () => {
  const saida = await processarFoto(pngGrande);
  const meta = await sharp(saida).metadata();
  expect(meta).toMatchObject({ format: 'webp', width: 256, height: 256 });
});

test('troca a foto, salva a URL e apaga a antiga do próprio usuário', async () => {
  const { service, storage, profileRepository } = montar();
  const usuario = { id: 'u1', avatar_url: `${URL_BASE}u1/antiga.webp` };
  const r = await service.trocar(usuario, { buffer: pngGrande, mimetype: 'image/png' });
  expect(storage.subir).toHaveBeenCalledWith(expect.stringMatching(/^u1\/[0-9a-f-]{36}\.webp$/), expect.any(Buffer));
  expect(profileRepository.atualizar).toHaveBeenCalledWith('u1', { avatar_url: r.avatarUrl });
  expect(storage.remover).toHaveBeenCalledWith(['u1/antiga.webp']);
});

test('recusa tipo errado e arquivo que não é imagem, sem subir nada', async () => {
  const { service, storage } = montar();
  await expect(service.trocar({ id: 'u1' }, { buffer: Buffer.from('%PDF-1.7'), mimetype: 'application/pdf' }))
    .rejects.toMatchObject({ fieldErrors: { foto: expect.any(String) } });
  await expect(service.trocar({ id: 'u1' }, { buffer: Buffer.from('não sou png'), mimetype: 'image/png' }))
    .rejects.toMatchObject({ fieldErrors: { foto: 'Não foi possível ler essa imagem. Tente outra foto.' } });
  await expect(service.trocar({ id: 'u1' }, undefined)).rejects.toMatchObject({ fieldErrors: { foto: 'Escolha uma foto.' } });
  expect(storage.subir).not.toHaveBeenCalled();
});

test('se o banco falhar, apaga o arquivo novo e mantém o antigo', async () => {
  const { service, storage, profileRepository } = montar();
  profileRepository.atualizar.mockRejectedValue(new Error('banco fora'));
  await expect(service.trocar({ id: 'u1', avatar_url: `${URL_BASE}u1/antiga.webp` }, { buffer: pngGrande, mimetype: 'image/png' })).rejects.toThrow('banco fora');
  const novo = storage.subir.mock.calls[0][0];
  expect(storage.remover).toHaveBeenCalledWith([novo]);
  expect(storage.remover).not.toHaveBeenCalledWith(['u1/antiga.webp']);
});

test('remover volta às iniciais', async () => {
  const { service, storage, profileRepository } = montar();
  await expect(service.remover({ id: 'u1', avatar_url: `${URL_BASE}u1/a.webp` })).resolves.toEqual({ avatarUrl: null });
  expect(profileRepository.atualizar).toHaveBeenCalledWith('u1', { avatar_url: null });
  expect(storage.remover).toHaveBeenCalledWith(['u1/a.webp']);
});

test('nunca apaga arquivo de outro usuário nem fora do bucket', () => {
  expect(caminhoNoBucket(`${URL_BASE}u2/x.webp`, 'u1')).toBeNull();
  expect(caminhoNoBucket(`${URL_BASE}u1/../u2/x.webp`, 'u1')).toBeNull();
  expect(caminhoNoBucket('https://outro.site/foto.png', 'u1')).toBeNull();
  expect(caminhoNoBucket(`${URL_BASE}u1/x.webp?t=1`, 'u1')).toBe('u1/x.webp');
});

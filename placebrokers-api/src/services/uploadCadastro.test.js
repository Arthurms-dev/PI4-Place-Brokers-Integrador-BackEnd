'use strict';

const mockFiles = new Map();
let mockUploadCount = 0;
let mockFailAt = 0;
const mockUpload = jest.fn(async function (caminho, buffer, options) {
  mockUploadCount += 1;
  if (mockFailAt === mockUploadCount) return { error: new Error('Envio interrompido') };
  const chave = `${this.bucket}/${caminho}`;
  if (!options.upsert && mockFiles.has(chave)) return { error: new Error('Já existe') };
  mockFiles.set(chave, buffer);
  return { error: null };
});
const mockRemove = jest.fn(async function (caminhos) {
  for (const caminho of caminhos) mockFiles.delete(`${this.bucket}/${caminho}`);
  return { error: null };
});
const mockAssinar = jest.fn(async (caminho) => ({ data: { signedUrl: `https://signed.test/${caminho}` }, error: null }));
jest.mock('../config/supabase', () => ({
  supabaseAdmin: { storage: { from: (bucket) => ({
    bucket, upload: mockUpload, remove: mockRemove, createSignedUrl: mockAssinar,
    getPublicUrl: (caminho) => ({ data: { publicUrl: `https://files.test/${bucket}/${caminho}` } }),
  }) } },
}));

const sharp = require('sharp');
const { UploadService } = require('./uploadService');
let imagem;
const pdf = { mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nTeste') };
beforeAll(async () => {
  imagem = { mimetype: 'image/png', buffer: await sharp({ create: {
    width: 8, height: 6, channels: 3, background: '#aabbcc',
  } }).png().toBuffer() };
});
beforeEach(() => {
  jest.clearAllMocks(); mockUploadCount = 0; mockFailAt = 0;
  mockFiles.clear();
  mockFiles.set('empreendimentos/mesmo-slug/capa.webp', Buffer.from('capa antiga'));
  mockFiles.set('documentos/mesmo-slug/book.pdf', Buffer.from('book antigo'));
});

test('dois cadastros do mesmo slug não reutilizam caminhos nem sobrescrevem arquivos', async () => {
  const service = new UploadService();
  const a = await service.uploadCadastro('mesmo-slug', { capa: imagem, galeria: [imagem], book: pdf, tabela: pdf });
  const b = await service.uploadCadastro('mesmo-slug', { capa: imagem, galeria: [imagem], book: pdf, tabela: pdf });
  expect(a.arquivos).toHaveLength(4);
  expect(new Set([...a.arquivos, ...b.arquivos].map((f) => f.caminho)).size).toBe(8);
  expect(mockUpload.mock.calls.every(([, , opcoes]) => opcoes.upsert === false)).toBe(true);
  expect(mockFiles.get('empreendimentos/mesmo-slug/capa.webp').toString()).toBe('capa antiga');
  expect(mockFiles.get('documentos/mesmo-slug/book.pdf').toString()).toBe('book antigo');
  const convertido = mockFiles.get(`empreendimentos/${a.arquivos[0].caminho}`);
  expect((await sharp(convertido).metadata()).format).toBe('webp');
});

test('falha no meio da galeria limpa apenas os uploads já concluídos', async () => {
  mockFailAt = 3;
  await expect(new UploadService().uploadCadastro('mesmo-slug', { capa: imagem, galeria: [imagem, imagem] }))
    .rejects.toThrow('Envio interrompido');
  expect(mockUpload).toHaveBeenCalledTimes(3);
  expect([...mockFiles.keys()]).toEqual(['empreendimentos/mesmo-slug/capa.webp', 'documentos/mesmo-slug/book.pdf']);
  expect(mockRemove.mock.calls[0][0]).toHaveLength(2);
});

test('falha na tabela também limpa os novos arquivos de ambos os buckets', async () => {
  mockFailAt = 3;
  await expect(new UploadService().uploadCadastro('mesmo-slug', { capa: imagem, book: pdf, tabela: pdf }))
    .rejects.toThrow('Envio interrompido');
  expect(mockRemove).toHaveBeenCalledTimes(2);
  expect(mockFiles.size).toBe(2);
});

test('não inicia upload se houver um PDF falso no lote', async () => {
  await expect(new UploadService().uploadCadastro('teste', { capa: imagem,
    book: { ...pdf, buffer: Buffer.from('isso não é PDF') } }))
    .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  expect(mockUpload).not.toHaveBeenCalled();
});

test('imagem ilegível não chega ao Storage e limpa a anterior', async () => {
  await expect(new UploadService().uploadCadastro('teste', { capa: imagem,
    galeria: [{ mimetype: 'image/png', buffer: Buffer.from('PNG falso') }] }))
    .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  expect(mockUpload).toHaveBeenCalledTimes(1);
  expect(mockFiles.size).toBe(2);
});

test('limite de galeria é validado antes dos uploads', async () => {
  await expect(new UploadService().uploadCadastro('teste', { galeria: Array(21).fill(imagem) }))
    .rejects.toMatchObject({ statusCode: 400 });
  expect(mockUpload).not.toHaveBeenCalled();
});

test('falha da limpeza não oculta o erro original de upload', async () => {
  const service = new UploadService();
  const falha = new Error('Limpeza indisponível');
  jest.spyOn(service, 'limparArquivosNovos').mockRejectedValue(falha);
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  mockFailAt = 2;
  try {
    await expect(service.uploadCadastro('teste', { capa: imagem, galeria: [imagem] }))
      .rejects.toThrow('Envio interrompido');
    expect(log).toHaveBeenCalled();
  } finally { log.mockRestore(); }
});

test('documentos do fluxo legado também ganham URLs novas a cada envio', async () => {
  const service = new UploadService();
  const a = await service.uploadDocumento('mesmo-slug', 'book', pdf);
  const b = await service.uploadDocumento('mesmo-slug', 'book', pdf);
  expect(a).not.toBe(b);
  expect(mockUpload.mock.calls.every(([, , opcoes]) => opcoes.upsert === false)).toBe(true);
});

test('PDF no caminho novo continua sendo aberto pela assinatura protegida existente', async () => {
  const service = new UploadService();
  const url = await service.uploadDocumento('mesmo-slug', 'book', pdf);
  const resultado = await service.assinarDocumento(url, 600);
  const caminho = mockUpload.mock.calls[0][0];
  expect(mockAssinar).toHaveBeenCalledWith(caminho, 600);
  expect(resultado).toEqual({ url: `https://signed.test/${caminho}`, expiraEmSegundos: 600 });
});

test('limpeza tenta os dois buckets mesmo quando o primeiro falha', async () => {
  mockRemove.mockImplementationOnce(async () => ({ error: new Error('Storage indisponível') }));
  await expect(new UploadService().limparArquivosNovos([
    { bucket: 'empreendimentos', caminho: 'novo/a.webp' }, { bucket: 'documentos', caminho: 'novo/a.pdf' },
  ])).rejects.toThrow('Falha ao limpar arquivos novos');
  expect(mockRemove).toHaveBeenCalledTimes(2);
});

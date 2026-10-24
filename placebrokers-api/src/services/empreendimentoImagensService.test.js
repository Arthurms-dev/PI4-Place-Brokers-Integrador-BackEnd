'use strict';
const { EmpreendimentoImagensService, validarImagem } = require('./empreendimentoImagensService');
const img = () => ({ buffer: Buffer.from('abc'), mimetype: 'image/png' });
function setup(imagens = []) {
  const repository = {
    buscarPorId: jest.fn().mockResolvedValue({ id: 'imovel1', imagens }),
    atualizar: jest.fn().mockResolvedValue({ id: 'imovel1' }),
    adicionarImagens: jest.fn().mockResolvedValue([{ id: 'foto3' }]),
    removerImagem: jest.fn().mockResolvedValue({ id: 'foto1' }),
  };
  const uploadService = {
    uploadImagemNova: jest.fn().mockResolvedValue({ url: 'https://storage.exemplo/abc.webp', caminho: 'imovel1/galeria/uuid.webp' }),
    limparImagensNovas: jest.fn().mockResolvedValue(undefined),
  };
  const invalidarCache = jest.fn();
  return { service: new EmpreendimentoImagensService({ repository, uploadService, invalidarCache }), repository, uploadService, invalidarCache };
}

test('troca capa sem sobrescrever arquivo antigo', async () => {
  const {service, repository, uploadService, invalidarCache} = setup();
  const r = await service.trocarCapa('imovel1', img());
  expect(r.capa_url).toContain('abc.webp');
  expect(repository.atualizar).toHaveBeenCalledWith('imovel1', { capa_url: r.capa_url });
  expect(uploadService.uploadImagemNova).toHaveBeenCalledWith('imovel1','capas',expect.anything());
  expect(invalidarCache).toHaveBeenCalled();
});
test('falha no banco limpa apenas novo arquivo', async () => {
  const {service,repository,uploadService} = setup();
  repository.atualizar.mockRejectedValue(new Error('BD falhou'));
  await expect(service.trocarCapa('imovel1',img())).rejects.toThrow('BD falhou');
  expect(uploadService.limparImagensNovas).toHaveBeenCalledWith(['imovel1/galeria/uuid.webp']);
});
test('não aceita SVG, nem arquivo sem buffer', () => {
  expect(() => validarImagem({ ...img(), mimetype: 'image/svg+xml' })).toThrow();
  expect(() => validarImagem(null)).toThrow();
});
test('não excede limite de 20 nem faz upload', async () => {
  const { service, uploadService } = setup(Array.from({length:20},(_,i)=>({id:`f${i}`})));
  await expect(service.adicionarGaleria('imovel1',[img()])).rejects.toMatchObject({code:'VALIDATION_ERROR'});
  expect(uploadService.uploadImagemNova).not.toHaveBeenCalled();
});
test('adiciona galeria com ordem posterior', async () => {
  const {service,repository} = setup([{id:'a',ordem:4}]);
  await service.adicionarGaleria('imovel1',[img(),img()]);
  const linhas = repository.adicionarImagens.mock.calls[0][0];
  expect(linhas.map(x=>x.ordem)).toEqual([5,6]);
  expect(linhas.every(x=>x.empreendimento_id==='imovel1')).toBe(true);
});
test('remoção é restrita ao empreendimento e não apaga Storage', async () => {
  const {service,repository,uploadService} = setup();
  await service.removerFoto('imovel1','foto1');
  expect(repository.removerImagem).toHaveBeenCalledWith('imovel1','foto1');
  expect(uploadService.limparImagensNovas).not.toHaveBeenCalled();
});
test('foto inexistente retorna NOT_FOUND', async () => {
  const {service, repository} = setup();
  repository.removerImagem.mockResolvedValue(null);
  await expect(service.removerFoto('imovel1','inexistente')).rejects.toMatchObject({code:'NOT_FOUND'});
});
test('empreendimento inexistente não aceita capa', async () => {
  const {service,repository,uploadService}=setup();
  repository.buscarPorId.mockResolvedValue(null);
  await expect(service.trocarCapa('imovel1', img())).rejects.toMatchObject({code:'NOT_FOUND'});
  expect(uploadService.uploadImagemNova).not.toHaveBeenCalled();
});

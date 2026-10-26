'use strict';
const { EmpreendimentoService } = require('./empreendimentoService');
const base = { nome: 'Mesmo nome', status: 'lancamento', uf: 'PE', cidade: 'Recife', bairro: 'Centro' };
const lote = () => ({ capaUrl: 'https://files.test/nova-capa.webp', galeriaUrls: ['https://files.test/nova-foto.webp'],
  bookUrl: 'https://files.test/novo-book.pdf', tabelaUrl: null,
  arquivos: [{ bucket: 'empreendimentos', caminho: 'uuid/capa.webp' }, { bucket: 'documentos', caminho: 'uuid/book.pdf' }],
});
function montar() {
  const repository = {
    criar: jest.fn(async (dados) => ({ ...dados })),
    inserirImagens: jest.fn().mockResolvedValue(undefined),
    buscarPorId: jest.fn().mockResolvedValue(null),
    removerCriacaoIncompleta: jest.fn(async (id) => ({ id })),
  };
  const uploadService = {
    gerarSlug: jest.fn().mockReturnValue('mesmo-nome'),
    uploadCadastro: jest.fn().mockResolvedValue(lote()),
    limparArquivosNovos: jest.fn().mockResolvedValue(undefined),
  };
  const service = new EmpreendimentoService({ empreendimentoRepository: repository, uploadService });
  jest.spyOn(service, 'invalidarCachePublico');
  return { service, repository, uploadService };
}

test('criação normal vincula capa, documentos e galeria à mesma identidade e mantém arquivos', async () => {
  const { service, repository, uploadService } = montar();
  const r = await service.criar(base, { capa: {} });
  expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(repository.inserirImagens).toHaveBeenCalledWith([{ empreendimento_id: r.id, url: lote().galeriaUrls[0], ordem: 0 }]);
  expect(r.capa_url).toBe(lote().capaUrl);
  expect(r.book_url).toBe(lote().bookUrl);
  expect(uploadService.limparArquivosNovos).not.toHaveBeenCalled();
  expect(repository.removerCriacaoIncompleta).not.toHaveBeenCalled();
});

test('upload incompleto não inicia cadastro no banco', async () => {
  const { service, repository, uploadService } = montar();
  uploadService.uploadCadastro.mockRejectedValue(new Error('upload falhou'));
  await expect(service.criar(base, { capa: {} })).rejects.toThrow('upload falhou');
  expect(repository.criar).not.toHaveBeenCalled();
});

test('slug duplicado limpa somente o lote novo e não tenta excluir o cadastro existente', async () => {
  const { service, repository, uploadService } = montar();
  repository.criar.mockRejectedValue({ code: '23505' });
  await expect(service.criar(base, { capa: {} })).rejects.toMatchObject({ statusCode: 409 });
  expect(uploadService.limparArquivosNovos).toHaveBeenCalledWith(lote().arquivos);
  expect(repository.buscarPorId).not.toHaveBeenCalled();
  expect(repository.removerCriacaoIncompleta).not.toHaveBeenCalled();
});

test('galeria rejeitada desfaz só o UUID criado e limpa depois da confirmação', async () => {
  const { service, repository, uploadService } = montar();
  repository.inserirImagens.mockRejectedValue(new Error('galeria falhou'));
  await expect(service.criar(base, { capa: {} })).rejects.toThrow('galeria falhou');
  const novoId = repository.criar.mock.calls[0][0].id;
  expect(repository.removerCriacaoIncompleta).toHaveBeenCalledWith(novoId);
  expect(uploadService.limparArquivosNovos).toHaveBeenCalledWith(lote().arquivos);
  expect(repository.removerCriacaoIncompleta.mock.invocationCallOrder[0])
    .toBeLessThan(uploadService.limparArquivosNovos.mock.invocationCallOrder[0]);
  expect(service.invalidarCachePublico).toHaveBeenCalled();
});

test('rollback impedido por FK preserva todos os arquivos e informa como conferir o cadastro', async () => {
  const { service, repository, uploadService } = montar();
  repository.inserirImagens.mockRejectedValue(new Error('resposta perdida'));
  repository.removerCriacaoIncompleta.mockRejectedValue({ code: '23503' });
  await expect(service.criar(base, { capa: {} })).rejects.toMatchObject({
    code: 'CREATE_UNCONFIRMED', statusCode: 500,
    message: expect.stringContaining('antes de reenviar'),
    fieldErrors: { empreendimentoId: expect.any(String) },
  });
  expect(uploadService.limparArquivosNovos).not.toHaveBeenCalled();
});

test('delete sem confirmação de linha removida não autoriza limpar arquivos', async () => {
  const { service, repository, uploadService } = montar();
  repository.inserirImagens.mockRejectedValue(new Error('falhou'));
  repository.removerCriacaoIncompleta.mockResolvedValue(null);
  await expect(service.criar(base, { capa: {} })).rejects.toMatchObject({ code: 'CREATE_UNCONFIRMED' });
  expect(uploadService.limparArquivosNovos).not.toHaveBeenCalled();
});

test('resposta perdida do INSERT consulta somente o UUID pré-alocado e pode desfazê-lo', async () => {
  const { service, repository, uploadService } = montar();
  repository.criar.mockRejectedValue(new Error('timeout'));
  repository.buscarPorId.mockImplementation(async (id) => ({ id }));
  await expect(service.criar(base, { capa: {} })).rejects.toThrow('timeout');
  const id = repository.criar.mock.calls[0][0].id;
  expect(repository.buscarPorId).toHaveBeenCalledWith(id);
  expect(repository.removerCriacaoIncompleta).toHaveBeenCalledWith(id);
  expect(uploadService.limparArquivosNovos).toHaveBeenCalled();
});

test.each(['ausente', 'consulta falhou'])('INSERT sem confirmação (%s) preserva arquivos por precaução', async (caso) => {
  const { service, repository, uploadService } = montar();
  repository.criar.mockRejectedValue(new Error('timeout'));
  if (caso === 'consulta falhou') repository.buscarPorId.mockRejectedValue(new Error('offline'));
  await expect(service.criar(base, { capa: {} })).rejects.toMatchObject({ code: 'CREATE_UNCONFIRMED' });
  expect(repository.removerCriacaoIncompleta).not.toHaveBeenCalled();
  expect(uploadService.limparArquivosNovos).not.toHaveBeenCalled();
});

test('falha de limpeza não substitui o diagnóstico do cadastro duplicado', async () => {
  const { service, repository, uploadService } = montar();
  repository.criar.mockRejectedValue({ code: '23505' });
  uploadService.limparArquivosNovos.mockRejectedValue(new Error('offline'));
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await expect(service.criar(base, { capa: {} })).rejects.toMatchObject({ statusCode: 409 });
    expect(log).toHaveBeenCalled();
  } finally { log.mockRestore(); }
});

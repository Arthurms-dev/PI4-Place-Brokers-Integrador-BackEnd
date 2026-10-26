'use strict';

const { EmpreendimentoService } = require('./empreendimentoService');

const base = {
  nome: 'Empreendimento de teste', status: 'lancamento', uf: 'PE',
  cidade: 'Recife', bairro: 'Boa Viagem',
};

function montar(atual = {}) {
  const registro = { id: 'imovel-1', ...atual };
  const repository = {
    buscarPorId: jest.fn().mockResolvedValue(registro),
    criar: jest.fn().mockImplementation(async (dados) => ({ id: 'novo', ...dados })),
    atualizar: jest.fn().mockImplementation(async (_, dados) => ({ ...registro, ...dados })),
    inserirImagens: jest.fn(),
  };
  const uploadService = {
    gerarSlug: jest.fn().mockReturnValue('imovel-de-teste'),
    uploadImagem: jest.fn(), uploadGaleria: jest.fn(), uploadDocumento: jest.fn(),
  };
  const service = new EmpreendimentoService({ empreendimentoRepository: repository, uploadService });
  return { service, repository, uploadService };
}

describe('validação de números antes de criar ou editar um empreendimento', () => {
  test.each([
    ['precoMin', -1], ['precoMax', Infinity], ['precoMin', NaN],
    ['areaMin', -0.01], ['areaMax', '50'], ['quartosMin', 1.5],
    ['quartosMax', -1], ['vagasMin', 0.5], ['vagasMax', true],
    ['precoMin', []], ['areaMin', {}], ['quartosMin', 32768],
    ['areaMax', 1000000], ['precoMax', 10000000000],
    ['latitude', 91], ['longitude', -181],
  ])('rejeita %s=%p sem upload nem gravação', async (campo, valor) => {
    const { service, repository, uploadService } = montar();
    const esperado = { code: 'VALIDATION_ERROR', statusCode: 400,
      fieldErrors: { [campo]: expect.any(String) } };
    await expect(service.criar({ ...base, [campo]: valor }, { capa: {} })).rejects.toMatchObject(esperado);
    await expect(service.atualizar('imovel-1', { [campo]: valor })).rejects.toMatchObject(esperado);
    expect(repository.criar).not.toHaveBeenCalled();
    expect(repository.atualizar).not.toHaveBeenCalled();
    expect(uploadService.gerarSlug).not.toHaveBeenCalled();
    expect(uploadService.uploadImagem).not.toHaveBeenCalled();
  });

  test.each([
    ['precoMin', 'precoMax', 400000, 300000],
    ['areaMin', 'areaMax', 65, 50],
    ['quartosMin', 'quartosMax', 3, 2],
    ['vagasMin', 'vagasMax', 2, 1],
  ])('rejeita faixa invertida de %s/%s nos dois fluxos', async (min, max, a, b) => {
    const { service, repository, uploadService } = montar();
    const faixa = { [min]: a, [max]: b };
    const esperado = { statusCode: 400, fieldErrors: { [max]: expect.any(String) } };
    await expect(service.criar({ ...base, ...faixa }, { galeria: [{}] })).rejects.toMatchObject(esperado);
    await expect(service.atualizar('imovel-1', faixa)).rejects.toMatchObject(esperado);
    expect(repository.criar).not.toHaveBeenCalled();
    expect(repository.atualizar).not.toHaveBeenCalled();
    expect(uploadService.uploadGaleria).not.toHaveBeenCalled();
  });

  test.each([
    ['precoMin', 'preco_min', 'preco_max', 450000, 300000, 400000],
    ['precoMax', 'preco_min', 'preco_max', 200000, 300000, 400000],
    ['areaMin', 'area_min', 'area_max', 80, 50, 65],
    ['areaMax', 'area_min', 'area_max', 40, 50, 65],
    ['quartosMin', 'quartos_min', 'quartos_max', 4, 2, 3],
    ['quartosMax', 'quartos_min', 'quartos_max', 1, 2, 3],
    ['vagasMin', 'vagas_min', 'vagas_max', 3, 0, 2],
    ['vagasMax', 'vagas_min', 'vagas_max', 0, 1, 2],
  ])('confere %s contra o limite já cadastrado na edição parcial', async (campo, min, max, valor, a, b) => {
    const { service, repository } = montar({ [min]: a, [max]: b });
    await expect(service.atualizar('imovel-1', { [campo]: valor })).rejects.toMatchObject({
      statusCode: 400, fieldErrors: { [campo]: expect.any(String) },
    });
    expect(repository.atualizar).not.toHaveBeenCalled();
  });

  test('considera os dois novos limites juntos, sem compará-los com a faixa antiga', async () => {
    const { service, repository } = montar({ preco_min: 300000, preco_max: 400000 });
    await service.atualizar('imovel-1', { precoMin: 500000, precoMax: 600000 });
    expect(repository.atualizar).toHaveBeenCalledWith('imovel-1', { preco_min: 500000, preco_max: 600000 });
  });

  test('aceita zero em contagens/preço/área e decimais válidos de preço/área', async () => {
    const { service, repository } = montar();
    await service.criar({ ...base, quartosMin: 0, quartosMax: 0, vagasMin: 0, vagasMax: 0,
      precoMin: 0, precoMax: 350000.99, areaMin: 0, areaMax: 55.75,
      latitude: 0, longitude: 0 });
    expect(repository.criar).toHaveBeenCalledWith(expect.objectContaining({
      quartos_min: 0, vagas_max: 0, preco_min: 0, preco_max: 350000.99,
      area_min: 0, area_max: 55.75, latitude: 0, longitude: 0,
    }));
  });

  test('mantém Sob consulta com valores ausentes e permite apagar um limite', async () => {
    const { service, repository } = montar({ preco_min: 300000, preco_max: 400000 });
    await service.criar({ ...base, precoMin: null, precoMax: null, areaMin: '' });
    expect(repository.criar).toHaveBeenCalledWith(expect.objectContaining({ preco_min: null, preco_max: null, area_min: null }));
    await service.atualizar('imovel-1', { precoMin: 450000, precoMax: '  ' });
    expect(repository.atualizar).toHaveBeenCalledWith('imovel-1', { preco_min: 450000, preco_max: null });
  });

  test('não obriga a corrigir uma faixa antiga ao editar só a descrição', async () => {
    const { service, repository } = montar({ area_min: 70, area_max: 50 });
    await service.atualizar('imovel-1', { descricao: 'Texto revisado' });
    expect(repository.atualizar).toHaveBeenCalledWith('imovel-1', { descricao: 'Texto revisado' });
  });

  test('permite corrigir faixa antiga alterando só um limite e aceita números do banco como texto', async () => {
    const { service, repository } = montar({ preco_min: '400000.00', preco_max: '300000.00' });
    await service.atualizar('imovel-1', { precoMax: 500000 });
    expect(repository.atualizar).toHaveBeenCalledWith('imovel-1', { preco_max: 500000 });
  });

  test('continua retornando NOT_FOUND quando o empreendimento não existe', async () => {
    const { service, repository } = montar();
    repository.buscarPorId.mockResolvedValue(null);
    await expect(service.atualizar('ausente', { precoMin: 100 })).rejects.toMatchObject({ statusCode: 404 });
    expect(repository.atualizar).not.toHaveBeenCalled();
  });

  test('não transforma corpo ou texto obrigatório inválido em erro 500', async () => {
    const { service } = montar();
    await expect(service.criar(null)).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.atualizar('imovel-1', [])).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.criar({ ...base, nome: 7 })).rejects.toMatchObject({ fieldErrors: { nome: expect.any(String) } });
    await expect(service.atualizar('imovel-1', { cidade: {} })).rejects.toMatchObject({ fieldErrors: { cidade: expect.any(String) } });
  });
});

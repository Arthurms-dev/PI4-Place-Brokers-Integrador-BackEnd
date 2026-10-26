'use strict';

const mockRepository = {
  criar: jest.fn().mockImplementation(async (dados) => ({ id: 'novo', ...dados })),
  inserirImagens: jest.fn(),
};
const mockUpload = { gerarSlug: jest.fn().mockReturnValue('teste'), uploadImagem: jest.fn() };

jest.mock('../repositories/empreendimentoRepository', () => ({
  EmpreendimentoRepository: jest.fn().mockImplementation(() => mockRepository),
}));
jest.mock('../services/uploadService', () => ({
  UploadService: jest.fn().mockImplementation(() => mockUpload),
}));

const { criar } = require('./empreendimentoController');

function resposta() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}
const base = { nome: 'Teste', status: 'lancamento', uf: 'PE', cidade: 'Recife', bairro: 'Centro' };
beforeEach(() => jest.clearAllMocks());

test.each(['abc', '350.000,00', 'Infinity', '1e999', '0x10', [], true])(
  'POST não transforma preço inválido %p em ausente', async (precoMin) => {
    const res = resposta();
    await criar({ body: { ...base, precoMin }, files: { capa: [{}] } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'VALIDATION_ERROR', fieldErrors: { precoMin: expect.any(String) },
    }));
    expect(mockRepository.criar).not.toHaveBeenCalled();
    expect(mockUpload.uploadImagem).not.toHaveBeenCalled();
  }
);

test('POST converte valores numéricos de FormData e conserva opcionais vazios', async () => {
  const res = resposta();
  await criar({ body: { ...base, precoMin: '350000.90', areaMin: '49.50', quartosMin: '2',
    vagasMin: '0', latitude: '-8.0476', longitude: '-34.8770', precoMax: ' ' } }, res);
  expect(res.status).toHaveBeenCalledWith(201);
  expect(mockRepository.criar).toHaveBeenCalledWith(expect.objectContaining({
    preco_min: 350000.90, area_min: 49.5, quartos_min: 2, vagas_min: 0,
    latitude: -8.0476, longitude: -34.8770, preco_max: null,
  }));
});

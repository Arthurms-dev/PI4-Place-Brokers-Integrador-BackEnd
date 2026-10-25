'use strict';
const { VendaService } = require('./vendaservice');

function setup(cliente = { id: 'cliente-a', corretor: { id: 'corretor-1', nome: 'Corretor' } }) {
  const vendaRepository = {
    criar: jest.fn().mockResolvedValue({ id:'venda-1', status:'pendente' }),
    listarPorCorretores: jest.fn().mockResolvedValue([]),
    listarTodas: jest.fn().mockResolvedValue([]),
  };
  const clienteRepository = { buscarPorId: jest.fn().mockResolvedValue(cliente) };
  const equipeRepository = {};
  return {
    vendaRepository, clienteRepository,
    service: new VendaService({ vendaRepository, clienteRepository, equipeRepository }),
  };
}
const corretor = { id:'corretor-1', cargo:'corretor' };
const venda = { valor: 300000, clienteId: 'cliente-a', empreendimentoId:'emp-1' };

describe('VendaService.criar: proteção da carteira', () => {
  test('permite cliente do próprio corretor, venda em estado pendente', async () => {
    const { service, vendaRepository, clienteRepository } = setup();
    await expect(service.criar(venda,corretor)).resolves.toMatchObject({status:'pendente'});
    expect(clienteRepository.buscarPorId).toHaveBeenCalledWith('cliente-a');
    expect(vendaRepository.criar).toHaveBeenCalledWith(expect.objectContaining({
      corretor_id:'corretor-1',cliente_id:'cliente-a',valor:300000,status:'pendente',
    }));
  });
  test('nega cliente pertencente a outro corretor', async () => {
    const { service, vendaRepository } = setup({id:'cliente-a',corretor:{id:'corretor-2'}});
    await expect(service.criar(venda,corretor)).rejects.toMatchObject({code:'FORBIDDEN',statusCode:403});
    expect(vendaRepository.criar).not.toHaveBeenCalled();
  });
  test('nega cliente inexistente', async () => {
    const {service,vendaRepository} = setup(null);
    await expect(service.criar(venda,corretor)).rejects.toMatchObject({code:'NOT_FOUND',statusCode:404});
    expect(vendaRepository.criar).not.toHaveBeenCalled();
  });
  test('não permite venda sem cliente vinculado', async () => {
    const {service,vendaRepository,clienteRepository} = setup();
    await expect(service.criar({...venda, clienteId:null},corretor)).rejects.toMatchObject({
      code:'VALIDATION_ERROR',statusCode:400,fieldErrors:{clienteId:expect.any(String)},
    });
    expect(clienteRepository.buscarPorId).not.toHaveBeenCalled();
    expect(vendaRepository.criar).not.toHaveBeenCalled();
  });
  test.each([Infinity,NaN,0,-1,null,''])('rejeita valor financeiro inválido %p', async valor => {
    const {service,vendaRepository}=setup();
    await expect(service.criar({...venda,valor},corretor)).rejects.toMatchObject({code:'VALIDATION_ERROR'});
    expect(vendaRepository.criar).not.toHaveBeenCalled();
  });
});

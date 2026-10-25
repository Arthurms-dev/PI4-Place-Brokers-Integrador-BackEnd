'use strict';
const { LeadService } = require('./leadService');

const linhaCliente = {
  id:'cliente-1', nome:'Vitória', corretor:{ id:'corretor-1', nome:'João' },
  lead:{id:'lead-1',nome:'Vitória'},
};
const linhaLead = {
  id:'lead-1', nome:'Vitória', status:'convertido',
  corretor:{id:'corretor-1', nome:'João'},
};
function criar(overrides={}) {
  const clienteRepository = {
    converterLeadEmCliente: jest.fn().mockResolvedValue('cliente-1'),
    buscarPorId: jest.fn().mockResolvedValue(linhaCliente),
    criar: jest.fn(),
    ...overrides.clienteRepository,
  };
  const leadRepository = {
    buscarPorId:jest.fn().mockResolvedValue(linhaLead),
    atualizarStatus:jest.fn(),
    ...overrides.leadRepository,
  };
  return { service: new LeadService({ leadRepository, clienteRepository }), clienteRepository, leadRepository };
}

describe('conversao de lead atomica via RPC', () => {
  test('retorna o mesmo contrato da API e nao usa INSERT ou UPDATE separados', async () => {
    const { service, clienteRepository, leadRepository } = criar();
    const resposta = await service.converterEmCliente('lead-1');
    expect(clienteRepository.converterLeadEmCliente).toHaveBeenCalledWith('lead-1');
    expect(resposta.cliente).toEqual(linhaCliente);
    expect(resposta.lead).toMatchObject({id:'lead-1', status:'convertido'});
    expect(leadRepository.buscarPorId).toHaveBeenCalledWith('lead-1');
    expect(clienteRepository.buscarPorId).toHaveBeenCalledWith('cliente-1');
    expect(clienteRepository.criar).not.toHaveBeenCalled();
    expect(leadRepository.atualizarStatus).not.toHaveBeenCalled();
  });
  test('se a transacao rejeitar por cliente existente, nao escreve mais nada', async () => {
    const falha = Object.assign(new Error('Este lead ja possui um cliente vinculado.'), { code:'CONFLICT', statusCode:409 });
    const { service, clienteRepository, leadRepository } = criar({
      clienteRepository:{converterLeadEmCliente:jest.fn().mockRejectedValue(falha)},
    });
    await expect(service.converterEmCliente('lead-1')).rejects.toMatchObject({code:'CONFLICT',statusCode:409});
    expect(clienteRepository.buscarPorId).not.toHaveBeenCalled();
    expect(leadRepository.buscarPorId).not.toHaveBeenCalled();
  });
});

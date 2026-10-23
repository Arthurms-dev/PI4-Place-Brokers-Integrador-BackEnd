'use strict';
const { LeadAtividadeService } = require('./leadAtividadeService');
const lead = { id:'l1', corretor:{ id:'c1' } };
function setup(found = lead) {
  const atividadeRepository = { listar:jest.fn().mockResolvedValue([]), criar:jest.fn().mockImplementation(async d=>({id:'a1',criado_em:new Date().toISOString(),...d})) };
  const leadRepository = { buscarPorId:jest.fn().mockResolvedValue(found) };
  return {atividadeRepository, leadRepository, service:new LeadAtividadeService({leadRepository, atividadeRepository})};
}
describe('LeadAtividadeService', () => {
  test('admin lista atividades', async () => {
    const {service,atividadeRepository}=setup();
    await expect(service.listar('l1',{id:'a1',cargo:'admin'})).resolves.toEqual([]);
    expect(atividadeRepository.listar).toHaveBeenCalledWith('l1');
  });
  test('corretor não pode ler lead de outro', async () => {
    const {service}=setup();
    await expect(service.listar('l1',{id:'c2',cargo:'corretor'})).rejects.toMatchObject({code:'FORBIDDEN'});
  });
  test('corretor pode registrar atividade apenas no seu lead', async () => {
    const {service,atividadeRepository}=setup();
    const result=await service.registrar('l1',{id:'c1',cargo:'corretor'},{tipo:'ligacao',descricao:'Conversou com cliente.'});
    expect(result.tipo).toBe('ligacao');
    expect(atividadeRepository.criar).toHaveBeenCalledWith(expect.objectContaining({lead_id:'l1',autor_id:'c1'}));
  });
  test('rejeita texto vazio e tipo inválido', async () => {
    const {service,atividadeRepository}=setup();
    await expect(service.registrar('l1',{id:'a',cargo:'admin'},{tipo:'teste',descricao:''})).rejects.toMatchObject({code:'VALIDATION_ERROR'});
    expect(atividadeRepository.criar).not.toHaveBeenCalled();
  });
  test('lead não encontrado', async () => {
    const {service}=setup(null);
    await expect(service.listar('x',{id:'a',cargo:'admin'})).rejects.toMatchObject({code:'NOT_FOUND'});
  });
});

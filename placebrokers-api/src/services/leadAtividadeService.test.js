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

describe('LeadAtividadeService.retornos (lembretes do corretor)', () => {
  const agora = new Date('2026-10-29T12:00:00Z');
  const linha = (id, leadId, proximo, criado, status = 'em_atendimento') => ({
    id, lead_id: leadId, descricao: 'Retornar', proximo_contato_em: proximo, criado_em: criado,
    lead: { id: leadId, nome: `Cliente ${leadId}`, telefone: '81999990000', status, corretor_id: 'c1', empreendimento: { id: 'e1', nome: 'Araçá Prime' } },
  });
  function montar(linhas, ultima = {}) {
    const atividadeRepository = {
      proximosDoCorretor: jest.fn().mockResolvedValue(linhas),
      ultimaAtividadePorLead: jest.fn().mockResolvedValue(ultima),
    };
    return { atividadeRepository, service: new LeadAtividadeService({ leadRepository: {}, atividadeRepository }) };
  }

  test('só corretor usa', async () => {
    const { service } = montar([]);
    await expect(service.retornos({ id: 'a', cargo: 'admin' }, agora)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  test('fica com o lembrete mais recente de cada lead e marca os atrasados', async () => {
    const { service, atividadeRepository } = montar([
      linha('a1', 'l1', '2026-10-29T10:00:00Z', '2026-10-28T09:00:00Z'),
      linha('a2', 'l1', '2026-10-30T09:00:00Z', '2026-10-29T08:00:00Z'),
      linha('a3', 'l2', '2026-10-29T11:00:00Z', '2026-10-29T07:00:00Z'),
    ], { l1: '2026-10-29T08:00:00Z', l2: '2026-10-29T07:00:00Z' });

    const r = await service.retornos({ id: 'c1', cargo: 'corretor' }, agora);

    expect(atividadeRepository.proximosDoCorretor.mock.calls[0][0]).toBe('c1');
    expect(r.map((x) => x.atividadeId)).toEqual(['a3', 'a2']);
    expect(r[0]).toMatchObject({ leadId: 'l2', atrasado: true, empreendimento: { nome: 'Araçá Prime' } });
    expect(r[1].atrasado).toBe(false);
  });

  test('some quando o corretor registrou algo depois do horário marcado', async () => {
    const { service } = montar([linha('a1', 'l1', '2026-10-29T10:00:00Z', '2026-10-28T09:00:00Z')], { l1: '2026-10-29T10:30:00Z' });
    await expect(service.retornos({ id: 'c1', cargo: 'corretor' }, agora)).resolves.toEqual([]);
  });

  test('ignora leads convertidos ou perdidos', async () => {
    const { service } = montar([linha('a1', 'l1', '2026-10-30T10:00:00Z', '2026-10-29T09:00:00Z', 'perdido')]);
    await expect(service.retornos({ id: 'c1', cargo: 'corretor' }, agora)).resolves.toEqual([]);
  });
});

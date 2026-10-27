'use strict';

const { LeadService } = require('./leadService');

const corretor = { id: 'corretor-1', cargo: 'corretor' };
const lead = { id: 'lead-1', nome: 'Ana Souza', email: 'Ana@Email.com', telefone: '(81) 8876-5432', status: 'novo', corretor: { id: 'corretor-1', nome: 'João' } };

function montar({ leadRow = lead, ligado = null, porContato = null, criar } = {}) {
  const leadRepository = { buscarPorId: jest.fn().mockResolvedValue(leadRow), atualizarStatus: jest.fn().mockResolvedValue({}) };
  const clienteRepository = {
    buscarPorLeadId: jest.fn().mockResolvedValue(ligado),
    buscarPorContato: jest.fn().mockResolvedValue(porContato),
    vincularLead: jest.fn().mockImplementation(async (id) => ({ id, nome: 'Ana', lead: { id: 'lead-1' } })),
    criar: criar ?? jest.fn().mockImplementation(async (d) => ({ id: 'cli-novo', ...d })),
  };
  return { service: new LeadService({ leadRepository, clienteRepository }), leadRepository, clienteRepository };
}

describe('lead → cliente da carteira (para agendar visita)', () => {
  test('cria o cliente a partir do lead, ligado a ele, e marca o lead em atendimento', async () => {
    const { service, clienteRepository, leadRepository } = montar();

    const r = await service.garantirCliente('lead-1', corretor);

    expect(r.criado).toBe(true);
    expect(clienteRepository.criar.mock.calls[0][0]).toMatchObject({
      nome: 'Ana Souza', email: 'ana@email.com', telefone: '81988765432', corretorId: 'corretor-1', leadId: 'lead-1',
    });
    expect(leadRepository.atualizarStatus).toHaveBeenCalledWith('lead-1', 'em_atendimento');
  });

  test('se o lead já tem cliente, devolve o mesmo sem criar outro', async () => {
    const { service, clienteRepository } = montar({ ligado: { id: 'cli-1', nome: 'Ana' } });

    const r = await service.garantirCliente('lead-1', corretor);

    expect(r).toEqual({ cliente: { id: 'cli-1', nome: 'Ana' }, criado: false });
    expect(clienteRepository.criar).not.toHaveBeenCalled();
  });

  test('mesmo telefone já na carteira do corretor: liga ao lead e reaproveita', async () => {
    const { service, clienteRepository } = montar({ porContato: { id: 'cli-2', nome: 'Ana S.', lead: null, corretor: { id: 'corretor-1' } } });

    const r = await service.garantirCliente('lead-1', corretor);

    expect(clienteRepository.vincularLead).toHaveBeenCalledWith('cli-2', 'lead-1');
    expect(r.criado).toBe(false);
    expect(clienteRepository.criar).not.toHaveBeenCalled();
  });

  test('contato que é cliente de outro corretor: recusa sem expor dados', async () => {
    const { service } = montar({ porContato: { id: 'cli-3', nome: 'Ana', corretor: { id: 'corretor-2' } } });

    await expect(service.garantirCliente('lead-1', corretor)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  test('corretor não mexe em lead de outro corretor', async () => {
    const { service } = montar({ leadRow: { ...lead, corretor: { id: 'corretor-2' } } });

    await expect(service.garantirCliente('lead-1', corretor)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  test('dois cliques ao mesmo tempo: o segundo pega o cliente criado pelo primeiro', async () => {
    const criar = jest.fn().mockRejectedValue(Object.assign(new Error('duplicate key'), { code: '23505' }));
    const { service, clienteRepository } = montar({ criar });
    clienteRepository.buscarPorLeadId.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'cli-1' });

    await expect(service.garantirCliente('lead-1', corretor)).resolves.toEqual({ cliente: { id: 'cli-1' }, criado: false });
  });
});

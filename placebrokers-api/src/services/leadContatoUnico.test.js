'use strict';

const { LeadService } = require('./leadService');
const { ClienteService } = require('./clienteservice');

describe('lead do site: uma pessoa, um lead', () => {
  const criarServico = (resultado = { leadId: 'lead-1', repetido: false }) => {
    const leadRepository = { registrarDoSite: jest.fn().mockResolvedValue(resultado), criar: jest.fn() };
    return { service: new LeadService({ leadRepository, clienteRepository: {} }), leadRepository };
  };

  test('envia o telefone ajustado e o e-mail em minúsculas para o banco decidir se é a mesma pessoa', async () => {
    const { service, leadRepository } = criarServico();

    await service.criar({ nome: ' Ana ', email: 'Ana@Email.com ', telefone: '+55 (81) 8876-5432', mensagem: 'Interesse em: Pátio Horí' });

    const [dados] = leadRepository.registrarDoSite.mock.calls[0];
    expect(dados).toEqual({ nome: 'Ana', email: 'ana@email.com', telefone: '81988765432', empreendimentoId: null, mensagem: 'Interesse em: Pátio Horí' });
    expect(leadRepository.criar).not.toHaveBeenCalled();
  });

  test('contato repetido não vira erro para o visitante', async () => {
    const { service } = criarServico({ leadId: 'lead-antigo', repetido: true });

    await expect(service.criar({ nome: 'Outro nome', email: 'ana@email.com', telefone: '81988765432' })).resolves.toEqual({ leadId: 'lead-antigo', repetido: true });
  });

  test('telefone com DDD inexistente é recusado antes de ir ao banco', async () => {
    const { service, leadRepository } = criarServico();

    await expect(service.criar({ nome: 'Ana', email: 'ana@email.com', telefone: '(20) 99876-5432' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(leadRepository.registrarDoSite).not.toHaveBeenCalled();
  });
});

describe('cliente: não cadastra a mesma pessoa duas vezes', () => {
  const corretor = { id: 'corretor-1', cargo: 'corretor' };
  const existente = { id: 'cli-1', nome: 'Maria Silva', telefone: '81999998888', email: 'maria@email.com', corretor: { id: 'corretor-2', nome: 'Sérgio' } };
  const criarServico = (achado) => {
    const clienteRepository = { buscarPorContato: jest.fn().mockResolvedValue(achado), criar: jest.fn().mockResolvedValue({ id: 'novo' }), buscarPorId: jest.fn() };
    return { service: new ClienteService({ clienteRepository }), clienteRepository };
  };

  test('mesmo telefone com outro nome: recusa e não revela o cliente de outro corretor', async () => {
    const { service, clienteRepository } = criarServico(existente);

    await expect(service.criar({ nome: 'M. Silva', telefone: '(81) 99999-8888' }, corretor)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Este contato já é cliente de outro corretor. Fale com o administrador.',
    });
    expect(clienteRepository.buscarPorContato.mock.calls[0][0]).toEqual({ email: null, telefone: '81999998888' });
    expect(clienteRepository.criar).not.toHaveBeenCalled();
  });

  test('admin vê de quem é o cliente', async () => {
    const { service } = criarServico(existente);

    await expect(service.criar({ nome: 'Maria', telefone: '81999998888', corretorId: 'corretor-1' }, { id: 'adm', cargo: 'admin' }))
      .rejects.toMatchObject({ message: 'Já existe o cliente Maria Silva com este telefone (corretor: Sérgio).' });
  });

  test('contato novo é cadastrado com o telefone ajustado', async () => {
    const { service, clienteRepository } = criarServico(null);

    await service.criar({ nome: 'João', telefone: '081 8876-5432' }, corretor);

    expect(clienteRepository.criar.mock.calls[0][0]).toMatchObject({ telefone: '81988765432', corretorId: 'corretor-1' });
  });
});

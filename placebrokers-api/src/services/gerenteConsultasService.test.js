'use strict';
const { LeadService } = require('./leadService');
const { AgendamentoService } = require('./agendamentoService');

test('servico de leads usa somente consulta filtrada, mantendo formato publico', async () => {
  const repo = { listar: jest.fn(), listarPorCorretores: jest.fn().mockResolvedValue([{
    id:'l-1', nome:'Cliente teste', status:'novo', corretor:{id:'c-1',nome:'Corretor Um'},
    empreendimento:{id:'e-1',nome:'Exemplo'},
  }]) };
  const service = new LeadService({leadRepository: repo, clienteRepository:{}});
  const lista = await service.listarPorCorretores(['c-1']);
  expect(repo.listarPorCorretores).toHaveBeenCalledWith(['c-1']);
  expect(repo.listar).not.toHaveBeenCalled();
  expect(lista).toMatchObject([{id:'l-1',corretor:{id:'c-1'},empreendimento:{id:'e-1'}}]);
});

test('servico de agenda usa somente consulta filtrada, mantendo formato publico', async () => {
  const repo = { listar: jest.fn(), listarPorCorretores: jest.fn().mockResolvedValue([{
    id:'a-1', tipo:'visita_imovel', corretor:{id:'c-2',nome:'Corretor Dois'},
    cliente:{id:'cli-1',nome:'Cliente'}, empreendimento:{id:'e-2',nome:'Imovel'},
  }]) };
  const service = new AgendamentoService({agendamentoRepository:repo});
  const lista = await service.listarPorCorretores(['c-2']);
  expect(repo.listarPorCorretores).toHaveBeenCalledWith(['c-2']);
  expect(repo.listar).not.toHaveBeenCalled();
  expect(lista).toMatchObject([{id:'a-1',corretor:{id:'c-2'},cliente:{id:'cli-1'}}]);
});

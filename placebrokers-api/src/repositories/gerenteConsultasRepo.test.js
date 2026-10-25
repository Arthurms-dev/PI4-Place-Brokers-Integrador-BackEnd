'use strict';
// Mock do cliente Supabase para conferir o filtro antes da consulta ao DB.
const mockFrom = jest.fn();
jest.mock('../config/supabase', () => ({ supabaseAdmin: { from: mockFrom } }));
const { EquipeRepository } = require('./equiperepository');
const { LeadRepository } = require('./leadRepository');
const { AgendamentoRepository } = require('./agendamentoRepository');
function query(resultado = []) {
  const q = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    then: (ok, fail) => Promise.resolve({data:resultado,error:null}).then(ok,fail),
  };
  mockFrom.mockReturnValue(q);
  return q;
}
beforeEach(() => mockFrom.mockReset());

test('nenhuma equipe: repositorio nao le profiles', async () => {
  await expect(new EquipeRepository().listarMembrosPorEquipes([])).resolves.toEqual([]);
  expect(mockFrom).not.toHaveBeenCalled();
});
test('lista de membros e filtrada por equipe, cargo e aprovacao na origem', async () => {
  const q = query([{id:'c-1'}]);
  const rows = await new EquipeRepository().listarMembrosPorEquipes(['time-a']);
  expect(rows).toEqual([{id:'c-1'}]);
  expect(mockFrom).toHaveBeenCalledWith('profiles');
  expect(q.in).toHaveBeenCalledWith('equipe_id',['time-a']);
  expect(q.eq).toHaveBeenCalledWith('cargo','corretor');
  expect(q.eq).toHaveBeenCalledWith('status','aprovado');
  expect(q.select.mock.calls[0][0]).not.toContain('creci');
});
test('nenhum corretor: nao consulta leads nem agenda', async () => {
  await expect(new LeadRepository().listarPorCorretores([])).resolves.toEqual([]);
  await expect(new AgendamentoRepository().listarPorCorretores([])).resolves.toEqual([]);
  expect(mockFrom).not.toHaveBeenCalled();
});
test('leads sao filtrados pelo ID do corretor na query', async () => {
  const q = query([{id:'l1'}]);
  expect(await new LeadRepository().listarPorCorretores(['c-1','c-2'])).toEqual([{id:'l1'}]);
  expect(mockFrom).toHaveBeenCalledWith('leads');
  expect(q.in).toHaveBeenCalledWith('corretor_id',['c-1','c-2']);
});
test('agendamentos sao filtrados pelo ID do corretor na query', async () => {
  const q = query([{id:'a1'}]);
  expect(await new AgendamentoRepository().listarPorCorretores(['c-2'])).toEqual([{id:'a1'}]);
  expect(mockFrom).toHaveBeenCalledWith('agendamentos');
  expect(q.in).toHaveBeenCalledWith('corretor_id',['c-2']);
});

'use strict';
jest.mock('../config/supabase', () => ({ supabaseAdmin: { from: jest.fn() } }));
const { supabaseAdmin } = require('../config/supabase');
const { EmpreendimentoRepository } = require('./empreendimentoRepository');

test('rollback restringe a exclusão ao ID recebido e exige a resposta do banco', async () => {
  const q = { delete: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(), maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'novo-id' }, error: null }) };
  supabaseAdmin.from.mockReturnValue(q);
  await expect(new EmpreendimentoRepository().removerCriacaoIncompleta('novo-id')).resolves.toEqual({ id: 'novo-id' });
  expect(supabaseAdmin.from).toHaveBeenCalledWith('empreendimentos');
  expect(q.eq).toHaveBeenCalledWith('id', 'novo-id');
  expect(q.select).toHaveBeenCalledWith('id');
  q.maybeSingle.mockResolvedValue({ data: null, error: { code: '23503' } });
  await expect(new EmpreendimentoRepository().removerCriacaoIncompleta('novo-id')).rejects.toEqual({ code: '23503' });
});

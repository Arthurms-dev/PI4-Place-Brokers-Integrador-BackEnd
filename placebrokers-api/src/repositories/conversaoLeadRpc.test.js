'use strict';
const mockRpc = jest.fn();
jest.mock('../config/supabase', () => ({supabaseAdmin:{rpc:mockRpc}}));
const { ClienteRepository } = require('./clienteRepository');
let repo;
beforeEach(() => { jest.clearAllMocks();repo=new ClienteRepository(); });

test('chama RPC no servidor e recebe identificador do cliente', async () => {
  mockRpc.mockResolvedValue({data:'cli-1',error:null});
  expect(await repo.converterLeadEmCliente('lead-1')).toBe('cli-1');
  expect(mockRpc).toHaveBeenCalledWith('converter_lead_em_cliente',{p_lead_id:'lead-1'});
});
test.each([
  ['PB_LEAD_NOT_FOUND','NOT_FOUND',404],
  ['PB_LEAD_MISSING_OWNER','VALIDATION_ERROR',400],
  ['PB_LEAD_ALREADY_CONVERTED','CONFLICT',409],
  ['PB_LEAD_ALREADY_HAS_CLIENT','CONFLICT',409],
])('erro do banco %s vira %s',async (message,code,statusCode) => {
  mockRpc.mockResolvedValue({data:null,error:{code:'P0001',message}});
  await expect(repo.converterLeadEmCliente('lead-1')).rejects.toMatchObject({code,statusCode});
});
test('unique index bloqueia duplicidade mesmo em solicitacoes concorrentes', async () => {
  mockRpc.mockResolvedValue({data:null,error:{code:'23505',message:'duplicate key'}});
  await expect(repo.converterLeadEmCliente('lead-1')).rejects.toMatchObject({code:'CONFLICT',statusCode:409});
});
test('falha desconhecida nao e ocultada', async () => {
  mockRpc.mockResolvedValue({data:null,error:{code:'08006',message:'database unavailable'}});
  await expect(repo.converterLeadEmCliente('lead-1')).rejects.toMatchObject({code:'08006'});
});

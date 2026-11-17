'use strict';

jest.mock('../config/supabase', () => ({ supabaseAdmin: {}, supabaseAuth: {} }));
const mockDashboard = jest.fn();
jest.mock('../services/metricasservice', () => ({
  MetricasService: jest.fn().mockImplementation(() => ({ dashboard: mockDashboard })),
}));

const { dashboard } = require('./metricascontroller');

function resposta() {
  return { statusCode: 0, corpo: null, status(n) { this.statusCode = n; return this; }, json(v) { this.corpo = v; return this; } };
}

beforeEach(() => {
  mockDashboard.mockReset().mockResolvedValue({ vgv: { total: 1 }, leads: { total: 3, recentes: [{ nome: 'Cliente' }] } });
});

test('diretor vê só a própria diretoria, mesmo pedindo outra', async () => {
  const res = resposta();
  await dashboard({ query: { de: '2026-11-01', ate: '2026-11-17', diretoriaId: 'outra', equipeId: 'eq-x' }, user: { cargo: 'diretor', diretoria_id: 'minha' } }, res);
  expect(mockDashboard).toHaveBeenCalledWith({ de: '2026-11-01', ate: '2026-11-17', equipeId: undefined, diretoriaId: 'minha' });
  expect(res.statusCode).toBe(200);
  expect(res.corpo.leads).toEqual({ total: 3, recentes: [] });
});

test('diretor sem diretoria recebe 403', async () => {
  const res = resposta();
  await dashboard({ query: {}, user: { cargo: 'diretor', diretoria_id: null } }, res);
  expect(res.statusCode).toBe(403);
  expect(mockDashboard).not.toHaveBeenCalled();
});

test('admin continua filtrando livremente e vê os últimos leads', async () => {
  const res = resposta();
  await dashboard({ query: { diretoriaId: 'qualquer' }, user: { cargo: 'admin' } }, res);
  expect(mockDashboard).toHaveBeenCalledWith(expect.objectContaining({ diretoriaId: 'qualquer' }));
  expect(res.corpo.leads.recentes).toHaveLength(1);
});

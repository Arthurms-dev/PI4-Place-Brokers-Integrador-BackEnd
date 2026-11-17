'use strict';

// Divisão de cargos (17/11/2026): cada cargo novo abre só o que é dele, inclusive por chamada direta à API.
jest.mock('../middlewares/authMiddleware', () => ({
  authMiddleware: jest.fn((req, res, next) => next()),
}));
jest.mock('../middlewares/optionalAuthMiddleware', () => ({
  optionalAuthMiddleware: jest.fn((req, res, next) => next()),
}));
jest.mock('../services/avisosSeguranca', () => ({
  vigia: { acessoNegado: jest.fn(() => Promise.resolve()), documentoAberto: jest.fn(() => Promise.resolve()) },
  emSegundoPlano: jest.fn(),
}));
jest.mock('../config/supabase', () => ({ supabaseAdmin: {}, supabaseAuth: {} }));
jest.mock('../services/roletaInstancia', () => ({ roletaService: {} }));

const { authMiddleware } = require('../middlewares/authMiddleware');
const roleta = require('./roletaRoutes');
const empreendimentos = require('./empreendimentoRoutes');
const construtoras = require('./construtoraRoutes');
const metricas = require('./metricasroutes');
const equipe = require('./equiperoutes');
const rh = require('./rhRoutes');
const trabalheConosco = require('./trabalheConoscoRoutes');

const TODOS = ['admin', 'gerente', 'corretor', 'viabilizador', 'rh', 'recepcao', 'diretor', 'cadastro'];

function middlewaresDaRota(router, method, path) {
  const layer = router.stack.find((l) => l.route?.path === path && l.route.methods[method]);
  if (!layer) throw new Error(`Rota inexistente: ${method.toUpperCase()} ${path}`);
  const globais = router.stack.filter((l) => !l.route).map((l) => l.handle);
  return [...globais, ...layer.route.stack.slice(0, -1).map((l) => l.handle)];
}

function liberado(stack, cargo) {
  const res = { status() { return this; }, json() { return this; } };
  for (const mw of stack) {
    if (mw === authMiddleware || mw.name === 'multerMiddleware' || mw.name === 'vigiarDocumento') continue;
    if (mw.name !== 'requireRoleMiddleware' && !/cargosPermitidos/.test(mw.toString())) continue;
    let passou = false;
    mw({ user: { id: 'u1', cargo }, originalUrl: '/' }, res, () => { passou = true; });
    if (!passou) return false;
  }
  return true;
}

function confere(router, method, path, permitidos) {
  const stack = middlewaresDaRota(router, method, path);
  expect(stack).toContain(authMiddleware);
  for (const cargo of TODOS) expect([cargo, liberado(stack, cargo)]).toEqual([cargo, permitidos.includes(cargo)]);
}

describe('recepção', () => {
  test.each([
    ['get', '/hoje'], ['post', '/chegada'], ['patch', '/chegada/:corretorId'],
    ['delete', '/chegada/:corretorId'], ['post', '/iniciar'], ['post', '/distribuir'],
  ])('%s /roleta%s: admin e recepção', (m, p) => confere(roleta, m, p, ['admin', 'recepcao']));

  test('não define focos (é do gerente)', () => confere(roleta, 'put', '/focos/:corretorId', ['admin', 'gerente']));
});

describe('cadastro', () => {
  test.each([
    ['post', '/'], ['patch', '/:id'], ['post', '/:id/imagens/capa'], ['post', '/:id/imagens/galeria'],
    ['delete', '/:id/imagens/:imagemId'], ['post', '/:id/tipologias'], ['patch', '/:id/tipologias/:tipologiaId'],
    ['get', '/:id/documentos/admin'], ['post', '/:id/documentos/admin'], ['patch', '/:id/documentos/admin/:docId'],
    ['get', '/documentos/pendencias'],
  ])('%s /empreendimentos%s: admin e cadastro', (m, p) => confere(empreendimentos, m, p, ['admin', 'cadastro']));

  test('cadastra construtora', () => confere(construtoras, 'post', '/', ['admin', 'cadastro']));
  test('não abre book de venda como corretor', () => confere(empreendimentos, 'get', '/:id/documentos/:tipo', ['admin', 'corretor', 'gerente']));
});

describe('diretor', () => {
  test('dashboard: admin e diretor', () => confere(metricas, 'get', '/dashboard', ['admin', 'diretor']));
  test('não mexe na equipe', () => {
    confere(equipe, 'patch', '/:id', ['admin']);
    confere(equipe, 'post', '/usuarios', ['admin']);
  });
});

describe('RH', () => {
  test.each([
    ['get', '/candidaturas'], ['patch', '/candidaturas/:id'], ['delete', '/candidaturas/:id'],
    ['get', '/candidaturas/:id/curriculo'], ['get', '/vagas'], ['post', '/vagas'], ['patch', '/vagas/:id'],
  ])('%s /rh%s: admin e RH', (m, p) => confere(rh, m, p, ['admin', 'rh']));
});

describe('Trabalhe conosco (site)', () => {
  test('vagas e candidatura são públicas, com limite e antispam no envio', () => {
    expect(middlewaresDaRota(trabalheConosco, 'get', '/vagas')).not.toContain(authMiddleware);
    const envio = middlewaresDaRota(trabalheConosco, 'post', '/candidaturas');
    expect(envio).not.toContain(authMiddleware);
    expect(envio.map((f) => f.name)).toEqual(['limitador', 'receberCurriculo', 'antiSpamCandidatura']);
  });
});

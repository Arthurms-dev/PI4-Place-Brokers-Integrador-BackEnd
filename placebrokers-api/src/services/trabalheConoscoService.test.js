'use strict';

const { TrabalheConoscoService, agendarLimpezaCandidaturas, ehPdf } = require('./trabalheConoscoService');

const PDF = { buffer: Buffer.from('%PDF-1.7 conteúdo'), mimetype: 'application/pdf' };
const VAGA = { id: '11111111-1111-4111-8111-111111111111', titulo: 'Corretor Recife', area: 'corretor', aberta: true };
const CAND_ID = '22222222-2222-4222-8222-222222222222';

function repoFalso() {
  return {
    listarVagas: jest.fn().mockResolvedValue([{ ...VAGA, unidade: 'Recife', descricao: null, criado_em: 'x' }]),
    buscarVaga: jest.fn().mockResolvedValue(VAGA),
    criarVaga: jest.fn(async (d) => ({ id: 'v1', ...d })),
    atualizarVaga: jest.fn(async (id, d) => ({ id, ...d })),
    buscarMesmaPessoa: jest.fn().mockResolvedValue(null),
    criarCandidatura: jest.fn().mockResolvedValue({ id: CAND_ID }),
    atualizarCandidatura: jest.fn(async (id, d) => ({ id, curriculo_path: 'a.pdf', ...d })),
    contarNovas: jest.fn().mockResolvedValue(3),
    listarCandidaturas: jest.fn().mockResolvedValue([{ id: CAND_ID, curriculo_path: 'x.pdf', nome: 'Ana' }]),
    buscarCandidatura: jest.fn().mockResolvedValue({ id: CAND_ID, curriculo_path: '2026-11/x.pdf' }),
    removerCandidatura: jest.fn().mockResolvedValue(),
    subirCurriculo: jest.fn().mockResolvedValue(),
    removerCurriculo: jest.fn().mockResolvedValue(),
    linkCurriculo: jest.fn().mockResolvedValue('https://assinado'),
    listarAntigas: jest.fn().mockResolvedValue([]),
    removerCandidaturas: jest.fn().mockResolvedValue(),
    removerCurriculos: jest.fn().mockResolvedValue(),
  };
}

const valido = (extra = {}) => ({
  nome: 'Ana Souza', email: 'Ana@Exemplo.com', telefone: '(81) 99629-8692',
  area: 'corretor', unidade: 'Recife', aceite: 'true', consentimentoVersao: '2026-11-17', ...extra,
});

let repo;
let service;
beforeEach(() => {
  repo = repoFalso();
  service = new TrabalheConoscoService({ candidaturaRepository: repo });
});

describe('candidatura pelo site', () => {
  test('salva no banco de talentos com e-mail minúsculo e telefone normalizado', async () => {
    await expect(service.candidatar(valido(), PDF)).resolves.toEqual({ recebido: true });
    expect(repo.subirCurriculo).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}\/[0-9a-f-]{36}\.pdf$/), PDF.buffer);
    expect(repo.criarCandidatura).toHaveBeenCalledWith(expect.objectContaining({
      vaga_id: null, email: 'ana@exemplo.com', telefone: '81996298692', area: 'corretor',
      curriculo_path: expect.stringMatching(/\.pdf$/),
    }));
  });

  test('currículo é opcional', async () => {
    await service.candidatar(valido());
    expect(repo.subirCurriculo).not.toHaveBeenCalled();
    expect(repo.criarCandidatura).toHaveBeenCalledWith(expect.objectContaining({ curriculo_path: null }));
  });

  test('mesma pessoa na mesma vaga atualiza em vez de duplicar e troca o currículo antigo', async () => {
    repo.buscarMesmaPessoa.mockResolvedValue({ id: CAND_ID, curriculo_path: 'antigo.pdf', reenvios: 1 });
    await expect(service.candidatar(valido(), PDF)).resolves.toEqual({ recebido: true });
    expect(repo.criarCandidatura).not.toHaveBeenCalled();
    expect(repo.atualizarCandidatura).toHaveBeenCalledWith(CAND_ID, expect.objectContaining({ reenvios: 2, criado_em: expect.any(String) }));
    expect(repo.removerCurriculo).toHaveBeenCalledWith('antigo.pdf');
  });

  test('vaga específica herda a área quando o formulário não manda', async () => {
    await service.candidatar(valido({ area: '', vagaId: VAGA.id }));
    expect(repo.criarCandidatura).toHaveBeenCalledWith(expect.objectContaining({ vaga_id: VAGA.id, area: 'corretor' }));
  });

  test('recusa vaga fechada', async () => {
    repo.buscarVaga.mockResolvedValue({ ...VAGA, aberta: false });
    await expect(service.candidatar(valido({ vagaId: VAGA.id }))).rejects.toMatchObject({ fieldErrors: { vagaId: expect.any(String) } });
  });

  test('recusa arquivo que não é PDF de verdade, sem subir nada', async () => {
    const falso = { buffer: Buffer.from('MZ executável'), mimetype: 'application/pdf' };
    await expect(service.candidatar(valido(), falso)).rejects.toMatchObject({ fieldErrors: { curriculo: expect.any(String) } });
    expect(repo.subirCurriculo).not.toHaveBeenCalled();
  });

  test('exige aceite, e-mail, telefone válido e área', async () => {
    await expect(service.candidatar(valido({ aceite: 'false', email: 'x', telefone: '123', area: 'piloto' })))
      .rejects.toMatchObject({ fieldErrors: { aceite: expect.any(String), email: expect.any(String), telefone: expect.any(String), area: expect.any(String) } });
  });

  test('LinkedIn só aceita link do LinkedIn', async () => {
    await expect(service.candidatar(valido({ linkedin: 'https://site-estranho.com/x' })))
      .rejects.toMatchObject({ fieldErrors: { linkedin: expect.any(String) } });
    await expect(service.candidatar(valido({ linkedin: 'https://www.linkedin.com/in/ana' }))).resolves.toEqual({ recebido: true });
  });

  test('se o banco falhar, apaga o currículo que acabou de subir', async () => {
    repo.criarCandidatura.mockRejectedValue(new Error('banco fora'));
    await expect(service.candidatar(valido(), PDF)).rejects.toThrow('banco fora');
    expect(repo.removerCurriculo).toHaveBeenCalledWith(repo.subirCurriculo.mock.calls[0][0]);
  });

  test('vagas abertas não expõem quem criou nem datas internas', async () => {
    const [v] = await service.vagasAbertas();
    expect(Object.keys(v).sort()).toEqual(['area', 'descricao', 'id', 'titulo', 'unidade']);
  });
});

describe('painel do RH', () => {
  test('lista sem o caminho do arquivo', async () => {
    const [c] = await service.listarCandidaturas({});
    expect(c).toEqual({ id: CAND_ID, nome: 'Ana', temCurriculo: true });
  });

  test('resumo conta as candidaturas novas para o menu', async () => {
    await expect(service.resumo()).resolves.toEqual({ novas: 3 });
  });

  test('filtro inválido', async () => {
    await expect(service.listarCandidaturas({ status: 'contratado' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  test('muda status e registra quem mexeu', async () => {
    await service.atualizarCandidatura(CAND_ID, { status: 'entrevista', notas: '  sexta 10h ' }, { id: 'rh-1' });
    expect(repo.atualizarCandidatura).toHaveBeenCalledWith(CAND_ID, { status: 'entrevista', notas: 'sexta 10h', atualizado_por: 'rh-1' });
  });

  test('link do currículo é temporário', async () => {
    await expect(service.linkCurriculo(CAND_ID)).resolves.toEqual({ url: 'https://assinado', expiraEmSegundos: 300 });
    expect(repo.linkCurriculo).toHaveBeenCalledWith('2026-11/x.pdf', 300);
  });

  test('apagar (LGPD) remove o registro e o arquivo', async () => {
    await service.removerCandidatura(CAND_ID);
    expect(repo.removerCandidatura).toHaveBeenCalledWith(CAND_ID);
    expect(repo.removerCurriculo).toHaveBeenCalledWith('2026-11/x.pdf');
  });

  test('id que não é UUID vira 404 sem ir ao banco', async () => {
    await expect(service.linkCurriculo('../../etc')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repo.buscarCandidatura).not.toHaveBeenCalled();
  });

  test('cria vaga validando área e unidade', async () => {
    await expect(service.criarVaga({ titulo: 'Vaga', area: 'xx', unidade: 'Olinda' }, { id: 'rh-1' }))
      .rejects.toMatchObject({ fieldErrors: { area: expect.any(String), unidade: expect.any(String) } });
    await service.criarVaga({ titulo: 'Corretor Caruaru', area: 'corretor', unidade: 'Caruaru' }, { id: 'rh-1' });
    expect(repo.criarVaga).toHaveBeenCalledWith({ titulo: 'Corretor Caruaru', area: 'corretor', unidade: 'Caruaru', criado_por: 'rh-1' });
  });

  test('fecha vaga', async () => {
    await service.atualizarVaga(VAGA.id, { aberta: false });
    expect(repo.atualizarVaga).toHaveBeenCalledWith(VAGA.id, { aberta: false });
  });
});

test('ehPdf confere o começo do arquivo', () => {
  expect(ehPdf(PDF)).toBe(true);
  expect(ehPdf({ buffer: Buffer.from('<html>') })).toBe(false);
  expect(ehPdf(undefined)).toBe(false);
});

describe('limpeza de 1 ano (LGPD)', () => {
  test('apaga currículos e depois as candidaturas mais antigas que 365 dias', async () => {
    repo.listarAntigas.mockResolvedValueOnce([{ id: 'c1', curriculo_path: 'a.pdf' }, { id: 'c2', curriculo_path: null }]);
    const n = await service.limparAntigas({ agora: new Date('2027-11-17T12:00:00Z') });
    expect(n).toBe(2);
    expect(repo.listarAntigas).toHaveBeenCalledWith('2026-11-17T12:00:00.000Z', 500);
    expect(repo.removerCurriculos).toHaveBeenCalledWith(['a.pdf']);
    expect(repo.removerCandidaturas).toHaveBeenCalledWith(['c1', 'c2']);
    expect(repo.removerCurriculos.mock.invocationCallOrder[0]).toBeLessThan(repo.removerCandidaturas.mock.invocationCallOrder[0]);
  });

  test('se o Storage falhar, não apaga as linhas', async () => {
    repo.listarAntigas.mockResolvedValueOnce([{ id: 'c1', curriculo_path: 'a.pdf' }]);
    repo.removerCurriculos.mockRejectedValueOnce(new Error('storage fora'));
    await expect(service.limparAntigas()).rejects.toThrow('storage fora');
    expect(repo.removerCandidaturas).not.toHaveBeenCalled();
  });

  test('nada antigo, nada apagado', async () => {
    await expect(service.limparAntigas()).resolves.toBe(0);
    expect(repo.removerCandidaturas).not.toHaveBeenCalled();
  });

  test('agenda 1 min depois de subir e depois todo dia, sem derrubar a API se falhar', async () => {
    jest.useFakeTimers();
    const falho = { limparAntigas: jest.fn().mockRejectedValue(new Error('x')) };
    const log = { log: jest.fn(), error: jest.fn() };
    const parar = agendarLimpezaCandidaturas({ service: falho, log });
    await jest.advanceTimersByTimeAsync(60 * 1000);
    expect(falho.limparAntigas).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(falho.limparAntigas).toHaveBeenCalledTimes(2);
    parar();
    jest.useRealTimers();
  });
});

'use strict';

const { RoletaService, relogioLocal, horario } = require('./roletaService');
const { LeadService } = require('./leadService');

// Recife é UTC-3 o ano todo.
const recife = (iso) => new Date(`${iso}-03:00`);
const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const E1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function setup({ agora = recife('2026-10-30T08:30:00'), repo = {}, equipes = {} } = {}) {
  const roletaRepository = {
    distribuir: jest.fn().mockResolvedValue(0),
    registrarChegada: jest.fn().mockResolvedValue({ ordem: 1, apto: true, chegou_em: agora.toISOString(), novo: true }),
    listarChegadas: jest.fn().mockResolvedValue([]),
    buscarChegada: jest.fn().mockResolvedValue(null),
    atualizarApto: jest.fn(),
    removerChegada: jest.fn().mockResolvedValue(true),
    buscarDia: jest.fn().mockResolvedValue(null),
    iniciarDia: jest.fn().mockResolvedValue(),
    listarAguardando: jest.fn().mockResolvedValue([]),
    entreguesNoDia: jest.fn().mockResolvedValue([]),
    listarCorretoresAtivos: jest.fn().mockResolvedValue([]),
    listarFocos: jest.fn().mockResolvedValue([]),
    substituirFocos: jest.fn().mockResolvedValue(),
    listarEmpreendimentos: jest.fn().mockResolvedValue([{ id: E1, nome: 'Araçá Prime', publicado: true }]),
    ...repo,
  };
  const equipeRepository = {
    listarTimes: jest.fn().mockResolvedValue([]),
    listarTimesDoGerente: jest.fn().mockResolvedValue([{ id: 't1', nome: 'Time A' }]),
    listarMembrosPorEquipes: jest.fn().mockResolvedValue([
      { id: C1, nome: 'Bruno', cargo: 'corretor', status: 'aprovado', ativo: true, equipe_id: 't1' },
    ]),
    ...equipes,
  };
  return { roletaRepository, equipeRepository, service: new RoletaService({ roletaRepository, equipeRepository, relogio: () => agora }) };
}

describe('roleta: horário de Recife', () => {
  test('dia e hora locais', () => {
    expect(relogioLocal(new Date('2026-10-30T02:30:00Z'))).toEqual({ dia: '2026-10-29', minutos: 23 * 60 + 30, diaSemana: 4 });
  });

  test('chegada até 09h, distribuição até 18h, domingo fechado, sábado abre às 08h', () => {
    expect(horario(recife('2026-10-30T08:59:00')).situacao).toBe('chegada');
    expect(horario(recife('2026-10-30T09:00:00')).situacao).toBe('distribuindo');
    expect(horario(recife('2026-10-30T18:00:00')).situacao).toBe('fechada');
    expect(horario(recife('2026-10-30T06:59:00')).situacao).toBe('fechada');
    expect(horario(recife('2026-10-31T07:30:00')).situacao).toBe('fechada');
    expect(horario(recife('2026-10-31T08:00:00')).situacao).toBe('chegada');
    expect(horario(recife('2026-11-01T10:00:00')).situacao).toBe('fechada');
  });
});

describe('roleta: recepção', () => {
  test('marca a chegada e devolve a posição', async () => {
    const { service, roletaRepository } = setup();
    await expect(service.marcarChegada(C1, { id: 'adm' })).resolves.toMatchObject({ ordem: 1, apto: true, novo: true });
    expect(roletaRepository.registrarChegada).toHaveBeenCalledWith(C1, 'adm');
  });

  test('corretor inválido ou inativo vira erro de validação', async () => {
    const { service } = setup({ repo: { registrarChegada: jest.fn().mockRejectedValue(new Error('CORRETOR_INVALIDO')) } });
    await expect(service.marcarChegada('nao-e-uuid')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(service.marcarChegada(C1)).rejects.toMatchObject({ code: 'VALIDATION_ERROR', message: 'Esse corretor não está ativo.' });
  });

  test('só inicia a roleta com alguém apto e dentro do horário', async () => {
    const semApto = setup({ repo: { listarChegadas: jest.fn().mockResolvedValue([{ corretor_id: C1, apto: false }]) } });
    await expect(semApto.service.iniciar({ id: 'adm' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(semApto.roletaRepository.iniciarDia).not.toHaveBeenCalled();

    const domingo = setup({ agora: recife('2026-11-01T08:00:00') });
    await expect(domingo.service.iniciar({ id: 'adm' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const ok = setup({ repo: { listarChegadas: jest.fn().mockResolvedValue([{ corretor_id: C1, apto: true }]), distribuir: jest.fn().mockResolvedValue(3) } });
    await expect(ok.service.iniciar({ id: 'adm' })).resolves.toEqual({ distribuidos: 3 });
    expect(ok.roletaRepository.iniciarDia).toHaveBeenCalledWith('2026-10-30', 'adm');
  });

  test('painel de hoje: quem falta marcar e quantos leads cada um recebeu', async () => {
    const { service } = setup({
      repo: {
        listarChegadas: jest.fn().mockResolvedValue([{ corretor_id: C1, ordem: 1, apto: true, chegou_em: 'x', corretor: { nome: 'Bruno' } }]),
        listarCorretoresAtivos: jest.fn().mockResolvedValue([{ id: C1, nome: 'Bruno' }, { id: C2, nome: 'Carla' }]),
        entreguesNoDia: jest.fn().mockResolvedValue([{ corretor_id: C1 }, { corretor_id: C1 }]),
      },
    });
    const painel = await service.hoje();
    expect(painel.dia).toBe('2026-10-30');
    expect(painel.chegadas).toEqual([{ corretorId: C1, nome: 'Bruno', ordem: 1, chegouEm: 'x', apto: true, recebidos: 2 }]);
    expect(painel.faltam).toEqual([{ id: C2, nome: 'Carla' }]);
    expect(painel.entreguesHoje).toBe(2);
  });

  test('erro ao distribuir não derruba o painel', async () => {
    const espiao = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { service } = setup({ repo: { distribuir: jest.fn().mockRejectedValue(new Error('falhou')) } });
    await expect(service.hoje()).resolves.toMatchObject({ dia: '2026-10-30' });
    espiao.mockRestore();
  });
});

describe('roleta: focos', () => {
  test('gerente só define foco de corretor da própria equipe', async () => {
    const { service, roletaRepository } = setup();
    await expect(service.definirFocos({ id: 'g1', cargo: 'gerente' }, C2, [E1])).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(roletaRepository.substituirFocos).not.toHaveBeenCalled();
  });

  test('salva sem repetir e recusa empreendimento que não existe', async () => {
    const { service, roletaRepository } = setup();
    await expect(service.definirFocos({ id: 'g1', cargo: 'gerente' }, C1, [E1, E1])).resolves.toEqual({ corretorId: C1, focos: [E1] });
    expect(roletaRepository.substituirFocos).toHaveBeenCalledWith(C1, [E1], 'g1');
    await expect(service.definirFocos({ id: 'g1', cargo: 'gerente' }, C1, ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'])).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(service.definirFocos({ id: 'g1', cargo: 'gerente' }, C1, 'x')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  test('lista os focos dos corretores da equipe', async () => {
    const { service } = setup({ repo: { listarFocos: jest.fn().mockResolvedValue([{ corretor_id: C1, empreendimento_id: E1 }]) } });
    const r = await service.listarFocos({ id: 'g1', cargo: 'gerente' });
    expect(r.corretores).toEqual([{ id: C1, nome: 'Bruno', equipe: 'Time A', focos: [E1] }]);
    expect(r.empreendimentos[0]).toMatchObject({ id: E1, nome: 'Araçá Prime' });
  });
});

describe('lead do site entra na roleta', () => {
  test('depois de registrar, pede a distribuição sem esperar', async () => {
    const roleta = { distribuirEmSegundoPlano: jest.fn() };
    const leadRepository = { registrarDoSite: jest.fn().mockResolvedValue({ leadId: 'l1', repetido: false }) };
    const service = new LeadService({ leadRepository, clienteRepository: {}, roleta });
    await expect(service.criar({ nome: 'Ana', email: 'ana@email.com', telefone: '81988765432' })).resolves.toEqual({ leadId: 'l1', repetido: false });
    expect(roleta.distribuirEmSegundoPlano).toHaveBeenCalledTimes(1);
  });
});

'use strict';
const { DiretorService } = require('./diretorService');

function montar() {
  const equipeRepository = {
    buscarDiretoria: jest.fn().mockResolvedValue({ id: 'd1', nome: 'Diretoria Litoral' }),
    listarTimesPorDiretoria: jest.fn().mockResolvedValue([{ id: 'e1', nome: 'Equipe A', sede: 'Recife', gerente_id: 'g1' }]),
    listarMembrosPorEquipes: jest.fn().mockResolvedValue([
      { id: 'c1', nome: 'Ana', cargo: 'corretor', status: 'aprovado', ativo: true, equipe_id: 'e1' },
      { id: 'c2', nome: 'Bia', cargo: 'corretor', status: 'aprovado', ativo: false, equipe_id: 'e1' },
      { id: 'c3', nome: 'Caio', cargo: 'corretor', status: 'pendente', ativo: true, equipe_id: 'e1' },
    ]),
    listar: jest.fn().mockResolvedValue([{ id: 'g1', nome: 'Gerente G', telefone: '81999990000' }]),
  };
  const leadRepository = { buscarPorId: jest.fn() };
  const leadService = { listarPorCorretores: jest.fn().mockResolvedValue([{ id: 'l1' }]), atribuirCorretor: jest.fn(async (id, c) => ({ id, corretor: { id: c } })) };
  return { service: new DiretorService({ equipeRepository, leadRepository, leadService }), equipeRepository, leadRepository, leadService };
}
const diretor = { id: 'dir', cargo: 'diretor', diretoria_id: 'd1' };

describe('área do diretor', () => {
  test('sem diretoria não vê nada', async () => {
    const { service, equipeRepository } = montar();
    await expect(service.contexto({ id: 'x', cargo: 'diretor' })).resolves.toEqual({ diretoria: null, equipes: [], membros: [] });
    expect(equipeRepository.listarTimesPorDiretoria).not.toHaveBeenCalled();
  });

  test('mostra a diretoria, as equipes com gerente e só corretores aprovados', async () => {
    const { service } = montar();
    const r = await service.contexto(diretor);
    expect(r.diretoria).toEqual({ id: 'd1', nome: 'Diretoria Litoral' });
    expect(r.equipes[0].gerente).toEqual({ id: 'g1', nome: 'Gerente G', telefone: '81999990000' });
    expect(r.membros.map((m) => m.id)).toEqual(['c1', 'c2']);
  });

  test('leads só dos corretores da diretoria', async () => {
    const { service, leadService } = montar();
    await service.leads(diretor);
    expect(leadService.listarPorCorretores).toHaveBeenCalledWith(['c1', 'c2']);
  });

  test('repassa para corretor ativo da diretoria', async () => {
    const { service, leadRepository, leadService } = montar();
    leadRepository.buscarPorId.mockResolvedValue({ id: 'l1', corretor: { id: 'c2' } });
    await service.repassar(diretor, 'l1', 'c1');
    expect(leadService.atribuirCorretor).toHaveBeenCalledWith('l1', 'c1');
  });

  test('não repassa para corretor inativo ou de fora', async () => {
    const { service, leadService } = montar();
    await expect(service.repassar(diretor, 'l1', 'c2')).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.repassar(diretor, 'l1', 'outro')).rejects.toMatchObject({ statusCode: 400 });
    expect(leadService.atribuirCorretor).not.toHaveBeenCalled();
  });

  test('não mexe em lead de outra diretoria', async () => {
    const { service, leadRepository } = montar();
    leadRepository.buscarPorId.mockResolvedValue({ id: 'l9', corretor: { id: 'de-fora' } });
    await expect(service.repassar(diretor, 'l9', 'c1')).rejects.toMatchObject({ statusCode: 403 });
  });
});

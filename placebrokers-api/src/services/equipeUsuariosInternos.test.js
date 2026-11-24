'use strict';

const { EquipeService } = require('./equipeservice');

const DIRETORIA = '33333333-3333-4333-8333-333333333333';

function montar() {
  const equipeRepository = {
    buscarDiretoria: jest.fn().mockResolvedValue({ id: DIRETORIA }),
    construtoraExiste: jest.fn().mockResolvedValue(true),
    buscarPorId: jest.fn(),
    atualizar: jest.fn(async (id, d) => ({ id, ...d })),
  };
  const profileRepository = { create: jest.fn(async (p) => ({ ...p, diretoria_id: p.diretoriaId ?? null, construtora_id: p.construtoraId ?? null })) };
  const authClient = { createUser: jest.fn().mockResolvedValue({ data: { user: { id: 'novo-1' } }, error: null }) };
  return { service: new EquipeService({ equipeRepository, profileRepository, authClient }), equipeRepository, profileRepository, authClient };
}

const base = { nome: 'Fulana', email: 'Fulana@Place.com', password: 'segredo1' };

describe('usuários internos criados pelo admin', () => {
  test.each(['rh', 'recepcao', 'cadastro', 'gerente'])('cria %s já aprovado', async (cargo) => {
    const { service, profileRepository } = montar();
    const r = await service.criarUsuarioInterno({ ...base, cargo });
    expect(r).toMatchObject({ cargo, status: 'aprovado', email: 'fulana@place.com' });
    expect(profileRepository.create).toHaveBeenCalledWith(expect.objectContaining({ cargo, status: 'aprovado', diretoriaId: null, trocarSenha: true }));
    expect(r.trocarSenha).toBe(true);
  });

  test('diretor precisa de diretoria', async () => {
    const { service, authClient } = montar();
    await expect(service.criarUsuarioInterno({ ...base, cargo: 'diretor' })).rejects.toMatchObject({ fieldErrors: { diretoriaId: expect.any(String) } });
    expect(authClient.createUser).not.toHaveBeenCalled();
  });

  test('diretor sai vinculado à diretoria', async () => {
    const { service, profileRepository } = montar();
    const r = await service.criarUsuarioInterno({ ...base, cargo: 'diretor', diretoriaId: DIRETORIA });
    expect(profileRepository.create).toHaveBeenCalledWith(expect.objectContaining({ cargo: 'diretor', diretoriaId: DIRETORIA }));
    expect(r.diretoria_id).toBe(DIRETORIA);
  });

  test('viabilizador precisa de construtora', async () => {
    const { service, authClient } = montar();
    await expect(service.criarUsuarioInterno({ ...base, cargo: 'viabilizador' })).rejects.toMatchObject({ fieldErrors: { construtoraId: expect.any(String) } });
    expect(authClient.createUser).not.toHaveBeenCalled();
  });

  test('viabilizador com construtora inexistente é recusado', async () => {
    const { service, equipeRepository, authClient } = montar();
    equipeRepository.construtoraExiste.mockResolvedValue(false);
    await expect(service.criarUsuarioInterno({ ...base, cargo: 'viabilizador', construtoraId: 'c-x' })).rejects.toMatchObject({ fieldErrors: { construtoraId: expect.any(String) } });
    expect(authClient.createUser).not.toHaveBeenCalled();
  });

  test('viabilizador sai aprovado e vinculado à construtora', async () => {
    const { service, profileRepository } = montar();
    const r = await service.criarUsuarioInterno({ ...base, cargo: 'viabilizador', construtoraId: 'c-1' });
    expect(profileRepository.create).toHaveBeenCalledWith(expect.objectContaining({ cargo: 'viabilizador', status: 'aprovado', construtoraId: 'c-1', diretoriaId: null }));
    expect(r.construtora_id).toBe('c-1');
  });

  test('outros cargos não levam construtora', async () => {
    const { service, profileRepository } = montar();
    await service.criarUsuarioInterno({ ...base, cargo: 'rh', construtoraId: 'c-1' });
    expect(profileRepository.create).toHaveBeenCalledWith(expect.objectContaining({ construtoraId: null }));
  });

  test.each(['admin', 'corretor', 'qualquer'])('não cria %s por aqui', async (cargo) => {
    const { service, authClient } = montar();
    await expect(service.criarUsuarioInterno({ ...base, cargo })).rejects.toMatchObject({ fieldErrors: { cargo: expect.any(String) } });
    expect(authClient.createUser).not.toHaveBeenCalled();
  });

  test('rota antiga de gerente continua funcionando', async () => {
    const { service } = montar();
    await expect(service.criarGerente(base)).resolves.toMatchObject({ cargo: 'gerente' });
  });

  test('admin troca a diretoria do diretor, mas não de outro cargo', async () => {
    const { service, equipeRepository } = montar();
    equipeRepository.buscarPorId.mockResolvedValue({ id: 'd1', cargo: 'diretor' });
    await service.atualizar('d1', { diretoriaId: DIRETORIA }, { id: 'adm' });
    expect(equipeRepository.atualizar).toHaveBeenCalledWith('d1', { diretoria_id: DIRETORIA });

    equipeRepository.buscarPorId.mockResolvedValue({ id: 'c1', cargo: 'corretor' });
    await expect(service.atualizar('c1', { diretoriaId: DIRETORIA }, { id: 'adm' })).rejects.toMatchObject({ fieldErrors: { diretoriaId: expect.any(String) } });
  });
});

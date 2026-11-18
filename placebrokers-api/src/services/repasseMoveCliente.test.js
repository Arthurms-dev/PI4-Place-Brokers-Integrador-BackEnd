'use strict';

jest.mock('../config/supabase', () => ({ supabaseAdmin: { from: jest.fn() } }));

const { supabaseAdmin } = require('../config/supabase');
const { LeadService } = require('./leadService');
const { LeadRepository } = require('../repositories/leadRepository');
const { ClienteRepository } = require('../repositories/clienteRepository');

// Repositórios de verdade sobre tabelas em memória: o teste cobre o repasse do começo ao fim.
function tabelaEmMemoria(linhas) {
  const filtros = [];
  let alteracao = null;
  const filtrar = (teste) => { filtros.push(teste); return consulta; };
  const consulta = {
    select: () => consulta,
    update: (campos) => { alteracao = campos; return consulta; },
    eq: (coluna, valor) => filtrar((l) => l[coluna] === valor),
    neq: (coluna, valor) => filtrar((l) => l[coluna] !== valor),
    in: (coluna, valores) => filtrar((l) => valores.includes(l[coluna])),
    gte: (coluna, valor) => filtrar((l) => l[coluna] >= valor),
    limit: () => consulta,
    maybeSingle: () => consulta.then((r) => ({ data: r.data[0] ?? null, error: null })),
    then: (resolver, rejeitar) => {
      const achadas = linhas.filter((l) => filtros.every((teste) => teste(l)));
      if (alteracao) achadas.forEach((l) => Object.assign(l, alteracao));
      return Promise.resolve({ data: achadas, error: null }).then(resolver, rejeitar);
    },
  };
  return consulta;
}

function montar({ leads, clientes, vendas = [], agendamentos = [], profiles = [] }) {
  const tabelas = { leads, clientes, vendas, agendamentos, profiles };
  supabaseAdmin.from.mockImplementation((tabela) => tabelaEmMemoria(tabelas[tabela]));
  return new LeadService({ leadRepository: new LeadRepository(), clienteRepository: new ClienteRepository() });
}

const dados = () => ({
  leads: [{ id: 'lead-1', nome: 'Carla', status: 'em_atendimento', corretor_id: 'bruno' }],
  clientes: [
    { id: 'cli-carla', lead_id: 'lead-1', corretor_id: 'bruno' },
    { id: 'cli-outro', lead_id: 'lead-2', corretor_id: 'bruno' },
    { id: 'cli-sem-lead', lead_id: null, corretor_id: 'bruno' },
  ],
});

describe('repasse de lead que já tem cliente', () => {
  test('o cliente do lead vai para a carteira do novo corretor; os outros clientes ficam', async () => {
    const { leads, clientes } = dados();
    const service = montar({ leads, clientes });

    await service.atribuirCorretor('lead-1', 'ana');

    expect(leads[0].corretor_id).toBe('ana');
    expect(clientes.map((c) => `${c.id}:${c.corretor_id}`)).toEqual(['cli-carla:ana', 'cli-outro:bruno', 'cli-sem-lead:bruno']);
  });

  test('lead sem cliente é repassado normalmente', async () => {
    const leads = [{ id: 'lead-9', nome: 'Davi', status: 'novo', corretor_id: 'bruno' }];
    const { clientes } = dados();
    const service = montar({ leads, clientes });

    await service.atribuirCorretor('lead-9', 'ana');

    expect(leads[0].corretor_id).toBe('ana');
    expect(clientes.every((c) => c.corretor_id === 'bruno')).toBe(true);
  });

  test('tirar o corretor do lead não mexe na carteira', async () => {
    const { leads, clientes } = dados();
    const service = montar({ leads, clientes });

    await service.atribuirCorretor('lead-1', null);

    expect(leads[0].corretor_id).toBe(null);
    expect(clientes[0].corretor_id).toBe('bruno');
  });

  test('lead que não existe: 404 e nenhum cliente muda de carteira', async () => {
    const { leads, clientes } = dados();
    const service = montar({ leads, clientes });

    await expect(service.atribuirCorretor('lead-x', 'ana')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(clientes.every((c) => c.corretor_id === 'bruno')).toBe(true);
  });

  test('venda pendente de outro corretor barra o repasse e nada muda', async () => {
    const { leads, clientes } = dados();
    const vendas = [{ id: 'v1', cliente_id: 'cli-carla', corretor_id: 'bruno', status: 'pendente' }];
    const profiles = [{ id: 'bruno', nome: 'Bruno' }];
    const service = montar({ leads, clientes, vendas, profiles });

    await expect(service.atribuirCorretor('lead-1', 'ana')).rejects.toMatchObject({
      code: 'CONFLICT', statusCode: 409, message: 'Este cliente tem uma venda pendente com Bruno. Confirme ou recuse a venda antes de repassar o lead.',
    });
    expect(leads[0].corretor_id).toBe('bruno');
    expect(clientes[0].corretor_id).toBe('bruno');
  });

  test('venda confirmada ou recusada não barra; ela continua com quem vendeu', async () => {
    const { leads, clientes } = dados();
    const vendas = [
      { id: 'v1', cliente_id: 'cli-carla', corretor_id: 'bruno', status: 'confirmada' },
      { id: 'v2', cliente_id: 'cli-carla', corretor_id: 'bruno', status: 'recusada' },
    ];
    const service = montar({ leads, clientes, vendas });

    await service.atribuirCorretor('lead-1', 'ana');
    expect(leads[0].corretor_id).toBe('ana');
    expect(vendas.every((v) => v.corretor_id === 'bruno')).toBe(true);
  });

  test('visitas futuras seguem o cliente; as que já passaram ou foram canceladas ficam', async () => {
    const { leads, clientes } = dados();
    const futuro = new Date(Date.now() + 86400000).toISOString();
    const passado = new Date(Date.now() - 86400000).toISOString();
    const agendamentos = [
      { id: 'a-futura', cliente_id: 'cli-carla', corretor_id: 'bruno', status: 'agendado', data_hora: futuro },
      { id: 'a-confirmada', cliente_id: 'cli-carla', corretor_id: 'bruno', status: 'confirmado', data_hora: futuro },
      { id: 'a-passada', cliente_id: 'cli-carla', corretor_id: 'bruno', status: 'realizado', data_hora: passado },
      { id: 'a-cancelada', cliente_id: 'cli-carla', corretor_id: 'bruno', status: 'cancelado', data_hora: futuro },
      { id: 'a-outro-cliente', cliente_id: 'cli-outro', corretor_id: 'bruno', status: 'agendado', data_hora: futuro },
    ];
    const service = montar({ leads, clientes, agendamentos });

    await service.atribuirCorretor('lead-1', 'ana');
    expect(agendamentos.map((a) => `${a.id}:${a.corretor_id}`)).toEqual([
      'a-futura:ana', 'a-confirmada:ana', 'a-passada:bruno', 'a-cancelada:bruno', 'a-outro-cliente:bruno',
    ]);
  });
});

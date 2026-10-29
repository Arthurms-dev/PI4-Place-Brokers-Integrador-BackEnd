'use strict';

const { calcularDesempenho, mediana } = require('./desempenhoEquipe');

const agora = new Date('2026-10-29T15:00:00Z');
const min = (m) => new Date(agora.getTime() - m * 60000).toISOString();
const membros = [{ id: 'c1', nome: 'Bruno' }, { id: 'c2', nome: 'Carla' }];

describe('desempenho da equipe', () => {
  const leads = [
    { id: 'l1', nome: 'Ana', status: 'novo', criado_em: min(120), atribuido_em: min(40), corretor_id: 'c1', empreendimento: { nome: 'Araçá' } },
    { id: 'l2', nome: 'Beto', status: 'novo', criado_em: min(10), atribuido_em: min(10), corretor_id: 'c1' },
    { id: 'l3', nome: 'Caio', status: 'em_atendimento', criado_em: min(300), atribuido_em: min(300), corretor_id: 'c2' },
    { id: 'l4', nome: 'Duda', status: 'novo', criado_em: min(60), atribuido_em: min(60), corretor_id: 'c2' },
    { id: 'l5', nome: 'Fora', status: 'novo', criado_em: min(90), atribuido_em: min(90), corretor_id: 'outro' },
  ];
  const atividades = [
    { lead_id: 'l3', tipo: 'observacao', criado_em: min(299) },
    { lead_id: 'l3', tipo: 'whatsapp', criado_em: min(296) },
    { lead_id: 'l3', tipo: 'ligacao', criado_em: min(290) },
    { lead_id: 'l4', tipo: 'ligacao', criado_em: min(52) },
  ];
  const r = calcularDesempenho({
    membros, leads, atividades, agora,
    agendamentos: [{ corretor_id: 'c2', tipo: 'visita_imovel', status: 'agendado', criado_em: min(100) }, { corretor_id: 'c2', tipo: 'visita_imovel', status: 'cancelado', criado_em: min(100) }],
    vendas: [{ corretor_id: 'c2', status: 'confirmada', valor: '200000', criado_em: min(50) }, { corretor_id: 'c1', status: 'pendente', valor: 1, criado_em: min(50) }],
  });

  test('sem atendimento: só lead novo da equipe, sem contato, passado do limite, contando de quando chegou ao corretor', () => {
    expect(r.semAtendimento).toEqual([
      { id: 'l1', nome: 'Ana', empreendimento: 'Araçá', corretor: { id: 'c1', nome: 'Bruno' }, desde: min(40), minutos: 40 },
    ]);
  });

  test('tempo de resposta = primeiro contato (ligação ou WhatsApp) desde a chegada', () => {
    const carla = r.corretores.find((c) => c.id === 'c2');
    expect(carla).toMatchObject({ recebidos: 2, atendidos: 2, tempoRespostaMin: 6, visitas: 1, vendas: 1, vgv: 200000 });
    const bruno = r.corretores.find((c) => c.id === 'c1');
    expect(bruno).toMatchObject({ recebidos: 2, atendidos: 0, tempoRespostaMin: null, vendas: 0 });
    expect(r.equipe).toMatchObject({ recebidos: 4, atendidos: 2, tempoRespostaMin: 6 });
  });

  test('mediana', () => {
    expect(mediana([])).toBe(null);
    expect(mediana([30, 2, 4])).toBe(4);
    expect(mediana([2, 4, 6, 100])).toBe(5);
  });
});

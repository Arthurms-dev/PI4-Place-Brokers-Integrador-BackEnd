'use strict';

const { MetricasService } = require('./metricasservice');

describe('meusAcessos (Início do corretor)', () => {
  test('devolve os 3 últimos empreendimentos abertos, sem repetir', async () => {
    const acessosDoUsuario = jest.fn().mockResolvedValue([
      { empreendimento_id: 'a', criado_em: '2026-10-27T12:00:00Z' },
      { empreendimento_id: 'b', criado_em: '2026-10-27T11:00:00Z' },
      { empreendimento_id: 'a', criado_em: '2026-10-26T10:00:00Z' },
      { empreendimento_id: 'c', criado_em: '2026-10-25T10:00:00Z' },
      { empreendimento_id: 'd', criado_em: '2026-10-24T10:00:00Z' },
    ]);
    const service = new MetricasService({ metricasRepository: { acessosDoUsuario }, equipeRepository: {} });

    const r = await service.meusAcessos({ id: 'corretor-1' });

    expect(acessosDoUsuario).toHaveBeenCalledWith('corretor-1');
    expect(r.map((x) => x.empreendimentoId)).toEqual(['a', 'b', 'c']);
    expect(r[0].acessadoEm).toBe('2026-10-27T12:00:00Z');
  });
});

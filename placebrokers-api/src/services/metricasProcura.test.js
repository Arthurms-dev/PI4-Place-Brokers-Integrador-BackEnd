'use strict';

const { MetricasService, MINIMO_PROCURA } = require('./metricasservice');

const ID = '1908d838-95c4-45d1-b8fc-2ad483e3b7df';

function criar(semana, mes) {
  const metricasRepository = {
    contarVisitasPublicas: jest.fn(async (_id, desde) => {
      const dias = Math.round((Date.parse('2026-11-18T12:00:00Z') - Date.parse(desde)) / 86400000);
      return dias <= 7 ? semana : mes;
    }),
  };
  return { servico: new MetricasService({ metricasRepository, equipeRepository: {} }), metricasRepository };
}
const AGORA = Date.parse('2026-11-18T12:00:00Z');

describe('procura do empreendimento (público)', () => {
  test('semana com movimento: mostra a semana', async () => {
    const { servico } = criar(57, 140);
    expect(await servico.procura(ID, AGORA)).toEqual({ pessoas: 57, periodo: 'semana' });
  });

  test('semana fraca, mês bom: mostra o mês', async () => {
    const { servico } = criar(8, 42);
    expect(await servico.procura(ID, AGORA)).toEqual({ pessoas: 42, periodo: 'mes' });
  });

  test(`abaixo de ${MINIMO_PROCURA} no mês: não mostra nada (número baixo queima o produto)`, async () => {
    const { servico } = criar(3, MINIMO_PROCURA - 1);
    expect(await servico.procura(ID, AGORA)).toBeNull();
  });

  test('guarda por 10 minutos (não consulta o banco a cada visita)', async () => {
    const { servico, metricasRepository } = criar(57, 140);
    await servico.procura(ID, AGORA);
    await servico.procura(ID, AGORA + 60_000);
    expect(metricasRepository.contarVisitasPublicas).toHaveBeenCalledTimes(1);
    await servico.procura(ID, AGORA + 11 * 60_000);
    expect(metricasRepository.contarVisitasPublicas).toHaveBeenCalledTimes(2);
  });

  test('id inválido é recusado', async () => {
    const { servico } = criar(1, 1);
    await expect(servico.procura('nao-e-uuid', AGORA)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

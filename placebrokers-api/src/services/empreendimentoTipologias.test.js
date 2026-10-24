
"use strict";

const { EmpreendimentoService } = require("./empreendimentoService");

function prepararServico() {
  const tipologia = {
    id: "tipologia-1",
    empreendimento_id: "empreendimento-1",
    nome: "Planta 2 quartos",
    quartos: 2,
    suites: 1,
    vagas: null,
    area_m2: 54,
    ordem: 0,
  };

  const repositorio = {
    buscarPorId: jest.fn().mockResolvedValue({
      id: "empreendimento-1",
      publicado: true,
    }),
    buscarTipologia: jest.fn().mockResolvedValue(tipologia),
    criarTipologia: jest.fn().mockResolvedValue(tipologia),
    atualizarTipologia: jest.fn().mockImplementation(
      async (_, __, dados) => ({
        ...tipologia,
        ...dados,
      })
    ),
  };

  const servico = new EmpreendimentoService({
    empreendimentoRepository: repositorio,
    uploadService: {},
  });

  return { servico, repositorio };
}

describe("Tipologias dos empreendimentos", () => {
  test("deve cadastrar uma tipologia válida", async () => {
    const { servico, repositorio } = prepararServico();

    const resultado = await servico.criarTipologia(
      "empreendimento-1",
      {
        nome: "Planta 2 quartos",
        quartos: 2,
        suites: 1,
        vagas: null,
        areaM2: 54,
        ordem: 0,
      }
    );

    expect(resultado.nome).toBe("Planta 2 quartos");

    expect(repositorio.criarTipologia).toHaveBeenCalledWith(
      "empreendimento-1",
      expect.objectContaining({
        quartos: 2,
        suites: 1,
        vagas: null,
        area_m2: 54,
      })
    );
  });

  test("não deve permitir mais suítes do que quartos", async () => {
    const { servico, repositorio } = prepararServico();

    await expect(
      servico.criarTipologia("empreendimento-1", {
        nome: "Planta inválida",
        quartos: 2,
        suites: 3,
      })
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });

    expect(repositorio.criarTipologia).not.toHaveBeenCalled();
  });

  test("deve atualizar a metragem sem alterar os outros dados", async () => {
    const { servico, repositorio } = prepararServico();

    const resultado = await servico.atualizarTipologia(
      "empreendimento-1",
      "tipologia-1",
      { areaM2: 55.5 }
    );

    expect(resultado.area_m2).toBe(55.5);
    expect(resultado.quartos).toBe(2);
    expect(resultado.suites).toBe(1);

    expect(repositorio.atualizarTipologia).toHaveBeenCalledWith(
      "empreendimento-1",
      "tipologia-1",
      { area_m2: 55.5 }
    );
  });

  test("não deve atualizar uma tipologia inexistente", async () => {
    const { servico, repositorio } = prepararServico();

    repositorio.buscarTipologia.mockResolvedValue(null);

    await expect(
      servico.atualizarTipologia(
        "empreendimento-1",
        "inexistente",
        { quartos: 3 }
      )
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    expect(repositorio.atualizarTipologia).not.toHaveBeenCalled();
  });

  test("não deve cadastrar em empreendimento inexistente", async () => {
    const { servico, repositorio } = prepararServico();

    repositorio.buscarPorId.mockResolvedValue(null);

    await expect(
      servico.criarTipologia("inexistente", {
        nome: "Planta 2 quartos",
        quartos: 2,
      })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    expect(repositorio.criarTipologia).not.toHaveBeenCalled();
  });

  test("não deve permitir campos desconhecidos", async () => {
    const { servico, repositorio } = prepararServico();

    await expect(
      servico.criarTipologia("empreendimento-1", {
        nome: "Planta 2 quartos",
        preco: 300000,
      })
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });

    expect(repositorio.criarTipologia).not.toHaveBeenCalled();
  });
});

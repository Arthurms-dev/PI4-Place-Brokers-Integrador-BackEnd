"use strict";
const { AuthService } = require("./authService");

describe("cadastro publico temporariamente restrito", () => {
  const service = new AuthService({ authClient: {}, profileRepository: {} });
  const comum = { nome: "Pessoa de Teste", email: "teste@example.com", password: "senha123", confirmPassword: "senha123" };

  test("permite corretor com vinculo interno", () => {
    expect(service.validateRegisterInput({ ...comum, role: "corretor", vinculo: "interno" })).toEqual({});
  });

  test("rejeita viabilizador mesmo se for enviado diretamente para a API", () => {
    expect(service.validateRegisterInput({ ...comum, role: "viabilizador", construtoraId: "construtora-1" })).toHaveProperty("role");
  });
});

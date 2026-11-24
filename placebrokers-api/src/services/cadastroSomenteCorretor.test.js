"use strict";
const { AuthService } = require("./authService");

describe("cadastro publico temporariamente restrito", () => {
  const service = new AuthService({ authClient: {}, profileRepository: {} });
  const comum = { nome: "Pessoa de Teste", email: "teste@example.com", password: "senha123", confirmPassword: "senha123", telefone: "81 99629-8692" };

  test("permite corretor com vinculo interno", () => {
    expect(service.validateRegisterInput({ ...comum, role: "corretor", vinculo: "interno" })).toEqual({});
  });

  test("rejeita viabilizador mesmo se for enviado diretamente para a API", () => {
    expect(service.validateRegisterInput({ ...comum, role: "viabilizador", construtoraId: "construtora-1" })).toHaveProperty("role");
  });
});

describe("WhatsApp no cadastro de corretor", () => {
  const service = new AuthService({ authClient: {}, profileRepository: {} });
  const comum = { nome: "Pessoa de Teste", email: "teste@example.com", password: "senha123", confirmPassword: "senha123", role: "corretor", vinculo: "interno" };

  test("é obrigatório", () => {
    expect(service.validateRegisterInput(comum)).toHaveProperty("telefone", "Informe o seu WhatsApp com DDD.");
  });

  test("recusa número inválido com a mensagem do validador", () => {
    expect(service.validateRegisterInput({ ...comum, telefone: "(00) 1234-5678" })).toHaveProperty("telefone", "DDD inválido.");
  });

  test("aceita com máscara e +55", () => {
    expect(service.validateRegisterInput({ ...comum, telefone: "+55 (81) 99629-8692" })).toEqual({});
  });
});

describe("cadastro salva o WhatsApp normalizado", () => {
  test("grava só os dígitos no perfil", async () => {
    const profileRepository = {
      findByEmail: jest.fn().mockResolvedValue(null),
      create: jest.fn(async (p) => ({ ...p, cargo: p.cargo, status: p.status })),
    };
    const authClient = { createUser: jest.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }) };
    const service = new AuthService({ authClient, profileRepository });
    await service.register({ nome: "Pessoa", email: "p@exemplo.com", password: "Senha-Forte-123", confirmPassword: "Senha-Forte-123", role: "corretor", vinculo: "interno", telefone: "(81) 99629-8692" });
    expect(profileRepository.create).toHaveBeenCalledWith(expect.objectContaining({ telefone: "81996298692" }));
  });
});

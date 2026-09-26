'use strict';

const { AuthError } = require('../errors/AuthError');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES_CADASTRO = ['corretor', 'viabilizador'];

function toPublicUser(profile) {
  return { id: profile.id, nome: profile.nome, email: profile.email, role: profile.cargo };
}

function isDuplicateEmailError(error) {
  return /already registered|already exists|duplicate/i.test(error?.message ?? '');
}

class AuthService {
  /**
   * @param {object} deps
   * @param {{ signInWithPassword: Function, createUser: Function }} deps.authClient
   * @param {{ findById: Function, create: Function }} deps.profileRepository
   */
  constructor({ authClient, profileRepository }) {
    this.authClient = authClient;
    this.profileRepository = profileRepository;
  }

  validateLoginInput({ email, password } = {}) {
    const errors = {};
    if (!email?.trim()) errors.email = 'Informe o e-mail.';
    else if (!EMAIL_REGEX.test(email.trim())) errors.email = 'E-mail inválido.';
    if (!password) errors.password = 'Informe a senha.';
    else if (password.length < 6) errors.password = 'A senha deve ter pelo menos 6 caracteres.';
    return errors;
  }

  /**
   * @param {{ email: string, password: string }} credentials
   * @returns {Promise<{ user: { id: string, nome: string, email: string, role: string }, token: string|null }>}
   */
  async login(credentials) {
    const fieldErrors = this.validateLoginInput(credentials);
    if (Object.keys(fieldErrors).length > 0) {
      throw new AuthError('VALIDATION_ERROR', 'Verifique os campos destacados.', fieldErrors);
    }

    const email = credentials.email.trim().toLowerCase();

    let authResult;
    try {
      authResult = await this.authClient.signInWithPassword({ email, password: credentials.password });
    } catch (cause) {
      throw new AuthError('SERVER_ERROR', 'Erro ao conectar à autenticação.', {}, cause);
    }

    const { data, error } = authResult;
    if (error || !data?.user) {
      throw new AuthError('INVALID_CREDENTIALS', 'E-mail ou senha incorretos.', {}, error);
    }

    let profile;
    try {
      profile = await this.profileRepository.findById(data.user.id);
    } catch (cause) {
      throw new AuthError('SERVER_ERROR', 'Erro ao buscar o perfil do usuário.', {}, cause);
    }

    if (!profile) {
      throw new AuthError('SERVER_ERROR', 'Usuário autenticado, mas sem perfil cadastrado.');
    }
    if (!profile.ativo) {
      throw new AuthError('USER_INACTIVE', 'Este usuário está inativo. Fale com um administrador.');
    }
    if (profile.status === 'pendente') {
      throw new AuthError('ACCOUNT_PENDING', 'Sua conta ainda está aguardando aprovação do administrador.');
    }
    if (profile.status === 'recusado') {
      throw new AuthError('ACCOUNT_REJECTED', 'Seu cadastro não foi aprovado. Fale com o administrador.');
    }

    return {
      user: toPublicUser(profile),
      token: data.session?.access_token ?? null,
    };
  }

  /**
   * @param {{ nome, email, password, confirmPassword, role, vinculo, creci }} payload
   */
  validateRegisterInput({ nome, email, password, confirmPassword, role, vinculo, creci } = {}) {
    const errors = this.validateLoginInput({ email, password });
    if (!nome?.trim()) errors.nome = 'Informe o nome completo.';
    if (confirmPassword !== password) errors.confirmPassword = 'As senhas não coincidem.';

    if (!role || !VALID_ROLES_CADASTRO.includes(role)) {
      errors.role = 'Selecione um perfil válido (corretor ou viabilizador).';
    }

    if (role === 'corretor') {
      if (!vinculo || !['interno', 'externo'].includes(vinculo)) {
        errors.vinculo = 'Informe se é corretor da Place ou parceiro externo.';
      }
      if (vinculo === 'externo' && !creci?.trim()) {
        errors.creci = 'CRECI é obrigatório para corretores externos.';
      }
    }

    return errors;
  }

  /**
   * @returns {Promise<{ user: object, token: null }>}
   */
  async register(payload) {
    const fieldErrors = this.validateRegisterInput(payload);
    if (Object.keys(fieldErrors).length > 0) {
      throw new AuthError('VALIDATION_ERROR', 'Verifique os campos destacados.', fieldErrors);
    }

    const email = payload.email.trim().toLowerCase();

    let createResult;
    try {
      createResult = await this.authClient.createUser({ email, password: payload.password });
    } catch (cause) {
      throw new AuthError('SERVER_ERROR', 'Erro ao criar o usuário de autenticação.', {}, cause);
    }

    const { data, error } = createResult;
    if (error) {
      if (isDuplicateEmailError(error)) {
        throw new AuthError('USER_ALREADY_EXISTS', 'Já existe uma conta com este e-mail.', {}, error);
      }
      throw new AuthError('SERVER_ERROR', 'Erro ao criar o usuário de autenticação.', {}, error);
    }

    let profile;
    try {
      profile = await this.profileRepository.create({
        id: data.user.id,
        nome: payload.nome.trim(),
        email,
        cargo: payload.role,
        vinculo: payload.vinculo ?? null,
        creci: payload.creci?.trim() || null,
        status: 'pendente',
      });
    } catch (cause) {
      throw new AuthError('SERVER_ERROR', 'Usuário criado, mas houve erro ao salvar o perfil.', {}, cause);
    }

    return { user: toPublicUser(profile), token: null };
  }
}

module.exports = { AuthService };
'use strict';

const { AppError } = require('../errors/AppError');

const STATUS_VALIDOS = ['pendente', 'aprovado', 'recusado'];
const CARGOS_VALIDOS = ['admin', 'corretor', 'viabilizador', 'gerente'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function erroDeCampo(campo, mensagem) {
  return new AppError('VALIDATION_ERROR', 'Verifique os campos destacados.', { [campo]: mensagem });
}

function ehViolacaoDeUnicidade(err) {
  return err?.code === '23505';
}

class EquipeService {
  /**
   * @param {object} deps
   * @param {object} deps.equipeRepository
   * @param {{ create: Function }} deps.profileRepository
   * @param {{ createUser: Function }} deps.authClient
   */
  constructor({ equipeRepository, profileRepository, authClient }) {
    this.equipeRepository = equipeRepository;
    this.profileRepository = profileRepository;
    this.authClient = authClient;
  }

  /** @param {{ status?: string, cargo?: string }} filtros */
  async listar({ status, cargo } = {}) {
    const erros = {};
    if (status && !STATUS_VALIDOS.includes(status)) erros.status = 'Status inválido.';
    if (cargo && !CARGOS_VALIDOS.includes(cargo)) erros.cargo = 'Cargo inválido.';
    if (Object.keys(erros).length) throw new AppError('VALIDATION_ERROR', 'Filtro inválido.', erros);

    return this.equipeRepository.listar({ status, cargo });
  }

  /**
   * @param {string} id
   * @param {{ status?: string, ativo?: boolean, equipeId?: string|null }} mudancas
   * @param {{ id: string }} admin
   */
  async atualizar(id, mudancas = {}, admin) {
    if (id === admin.id) {
      throw new AppError('FORBIDDEN', 'Você não pode alterar a própria conta.');
    }

    const membro = await this.equipeRepository.buscarPorId(id);
    if (!membro) throw new AppError('NOT_FOUND', 'Usuário não encontrado.');

    const dados = {};

    if (mudancas.status !== undefined) {
      if (!STATUS_VALIDOS.includes(mudancas.status)) throw erroDeCampo('status', 'Status inválido.');
      dados.status = mudancas.status;
      dados.aprovado_por = mudancas.status === 'aprovado' ? admin.id : null;
      dados.aprovado_em = mudancas.status === 'aprovado' ? new Date().toISOString() : null;
    }

    if (mudancas.ativo !== undefined) {
      if (typeof mudancas.ativo !== 'boolean') throw erroDeCampo('ativo', 'Deve ser verdadeiro ou falso.');
      dados.ativo = mudancas.ativo;
    }

    if (mudancas.equipeId !== undefined) {
      const equipeId = mudancas.equipeId === '' ? null : mudancas.equipeId;
      if (equipeId !== null) {
        if (membro.cargo !== 'corretor') throw erroDeCampo('equipeId', 'Só corretores entram em equipes.');
        const time = await this.equipeRepository.buscarTime(equipeId);
        if (!time) throw erroDeCampo('equipeId', 'Equipe não encontrada.');
      }
      dados.equipe_id = equipeId;
    }

    if (dados.status && dados.status !== 'aprovado') dados.equipe_id = null;

    if (Object.keys(dados).length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Nada para atualizar.');
    }

    return this.equipeRepository.atualizar(id, dados);
  }

  /**
   * @param {{ nome?: string, email?: string, password?: string }} dados
   */
  async criarGerente({ nome, email, password } = {}) {
    const erros = {};
    if (!nome?.trim()) erros.nome = 'Informe o nome.';
    if (!email?.trim() || !EMAIL_REGEX.test(email.trim())) erros.email = 'E-mail inválido.';
    if (!password || password.length < 6) erros.password = 'A senha deve ter pelo menos 6 caracteres.';
    if (Object.keys(erros).length) throw new AppError('VALIDATION_ERROR', 'Verifique os campos destacados.', erros);

    const emailNormalizado = email.trim().toLowerCase();

    let resultado;
    try {
      resultado = await this.authClient.createUser({ email: emailNormalizado, password });
    } catch (cause) {
      throw new AppError('SERVER_ERROR', 'Erro ao criar o usuário de autenticação.', {}, cause);
    }

    const { data, error } = resultado;
    if (error) {
      if (/already registered|already exists|duplicate/i.test(error.message ?? '')) {
        throw erroDeCampo('email', 'Já existe uma conta com este e-mail.');
      }
      throw new AppError('SERVER_ERROR', 'Erro ao criar o usuário de autenticação.', {}, error);
    }

    try {
      const perfil = await this.profileRepository.create({
        id: data.user.id,
        nome: nome.trim(),
        email: emailNormalizado,
        cargo: 'gerente',
        status: 'aprovado',
      });
      return { id: perfil.id, nome: perfil.nome, email: perfil.email, cargo: perfil.cargo, status: perfil.status };
    } catch (cause) {
      throw new AppError('SERVER_ERROR', 'Usuário criado, mas houve erro ao salvar o perfil.', {}, cause);
    }
  }


  async listarDiretorias() {
    return this.equipeRepository.listarDiretorias();
  }

  async validarDiretoria(diretoriaId) {
    if (!diretoriaId) return null;
    const diretoria = await this.equipeRepository.buscarDiretoria(diretoriaId);
    if (!diretoria) throw erroDeCampo('diretoriaId', 'Diretoria não encontrada.');
    return diretoria.id;
  }

  /** @param {{ nome?: string }} dados */
  async criarDiretoria({ nome } = {}) {
    if (!nome?.trim()) throw erroDeCampo('nome', 'Informe o nome da diretoria.');
    try {
      return await this.equipeRepository.criarDiretoria({ nome: nome.trim() });
    } catch (err) {
      if (ehViolacaoDeUnicidade(err)) throw erroDeCampo('nome', 'Já existe uma diretoria com esse nome.');
      throw err;
    }
  }


  async listarTimes() {
    const [times, membros, diretorias] = await Promise.all([
      this.equipeRepository.listarTimes(),
      this.equipeRepository.listar({}),
      this.equipeRepository.listarDiretorias(),
    ]);

    return times.map((time) => {
      const gerente = membros.find((m) => m.id === time.gerente_id);
      const diretoria = diretorias.find((d) => d.id === time.diretoria_id);
      return {
        id: time.id,
        nome: time.nome,
        gerenteId: time.gerente_id,
        gerente: gerente ? { id: gerente.id, nome: gerente.nome, email: gerente.email } : null,
        diretoriaId: time.diretoria_id,
        diretoria: diretoria ? { id: diretoria.id, nome: diretoria.nome } : null,
        totalMembros: membros.filter((m) => m.equipe_id === time.id).length,
        criado_em: time.criado_em,
      };
    });
  }

  async validarGerente(gerenteId) {
    if (!gerenteId) return null;
    const gerente = await this.equipeRepository.buscarPorId(gerenteId);
    if (!gerente || gerente.cargo !== 'gerente') throw erroDeCampo('gerenteId', 'Escolha um gerente válido.');
    return gerente.id;
  }

  traduzirErroDeTime(err) {
    if (ehViolacaoDeUnicidade(err)) return erroDeCampo('nome', 'Já existe uma equipe com esse nome.');
    return err;
  }

  /** @param {{ nome?: string, gerenteId?: string|null, diretoriaId?: string|null }} dados */
  async criarTime({ nome, gerenteId, diretoriaId } = {}) {
    if (!nome?.trim()) throw erroDeCampo('nome', 'Informe o nome da equipe.');
    const gerente_id = await this.validarGerente(gerenteId);
    const diretoria_id = await this.validarDiretoria(diretoriaId);

    try {
      return await this.equipeRepository.criarTime({ nome: nome.trim(), gerente_id, diretoria_id });
    } catch (err) {
      throw this.traduzirErroDeTime(err);
    }
  }

  async atualizarTime(id, mudancas = {}) {
    const time = await this.equipeRepository.buscarTime(id);
    if (!time) throw new AppError('NOT_FOUND', 'Equipe não encontrada.');

    const dados = {};
    if (mudancas.nome !== undefined) {
      if (!mudancas.nome?.trim()) throw erroDeCampo('nome', 'Informe o nome da equipe.');
      dados.nome = mudancas.nome.trim();
    }
    if (mudancas.gerenteId !== undefined) {
      dados.gerente_id = await this.validarGerente(mudancas.gerenteId || null);
    }
    if (mudancas.diretoriaId !== undefined) {
      dados.diretoria_id = await this.validarDiretoria(mudancas.diretoriaId || null);
    }
    if (Object.keys(dados).length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Nada para atualizar.');
    }

    try {
      return await this.equipeRepository.atualizarTime(id, dados);
    } catch (err) {
      throw this.traduzirErroDeTime(err);
    }
  }

  async removerTime(id) {
    const time = await this.equipeRepository.buscarTime(id);
    if (!time) throw new AppError('NOT_FOUND', 'Equipe não encontrada.');
    await this.equipeRepository.removerTime(id);
  }
}

module.exports = { EquipeService };
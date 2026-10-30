'use strict';

const { AuthError } = require('../errors/AuthError');
const { emailRedefinirSenha } = require('../emails/redefinirSenha');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_REGEX = /^[A-Za-z0-9_-]{20,200}$/;
const TAMANHO_MINIMO = 8;

const MENSAGEM_ENVIADA = 'Se este e-mail estiver cadastrado, enviamos um link para criar uma senha nova. Confira também a caixa de spam.';
const MENSAGEM_LINK_INVALIDO = 'Este link expirou ou já foi usado. Peça um novo em "Esqueci minha senha".';

/** Endereço do site usado no link. Nunca vem do pedido (evita link apontando para outro site). */
function urlDoSite(env = process.env) {
  const configurada = env.SITE_URL || String(env.CORS_ORIGIN ?? '').split(',')[0];
  return (configurada || 'http://localhost:5173').trim().replace(/\/+$/, '');
}

/** Roda a tarefa depois de responder, para o tempo de resposta não revelar se o e-mail existe. */
const emSegundoPlano = (tarefa) => { setImmediate(() => { tarefa(); }); };

class RedefinicaoSenhaService {
  /**
   * @param {object} deps
   * @param {{ buscarParaRecuperacao: Function }} deps.profileRepository
   * @param {{ gerarToken: Function, conferirToken: Function, trocarSenha: Function, encerrarSessoes: Function }} deps.recuperacao
   * @param {{ enviar: Function }} deps.email
   * @param {{ criarAviso: Function }|null} [deps.painelAdmRepository]
   * @param {(tarefa: Function) => void} [deps.agendar]
   * @param {string} [deps.site]
   * @param {number} [deps.validadeMinutos]
   * @param {Console} [deps.log]
   */
  constructor({ profileRepository, recuperacao, email, painelAdmRepository = null, agendar = emSegundoPlano, site = urlDoSite(), validadeMinutos = 60, log = console }) {
    this.profileRepository = profileRepository;
    this.recuperacao = recuperacao;
    this.email = email;
    this.painelAdmRepository = painelAdmRepository;
    this.agendar = agendar;
    this.site = site;
    this.validadeMinutos = validadeMinutos;
    this.log = log;
  }

  /**
   * "Esqueci minha senha". Sempre responde a mesma coisa, exista ou não o e-mail.
   * @param {{ email?: string }} dados
   */
  async solicitar({ email } = {}) {
    const limpo = String(email ?? '').trim().toLowerCase();
    if (!limpo) throw new AuthError('VALIDATION_ERROR', 'Verifique os campos destacados.', { email: 'Informe o e-mail.' });
    if (!EMAIL_REGEX.test(limpo) || limpo.length > 160) {
      throw new AuthError('VALIDATION_ERROR', 'Verifique os campos destacados.', { email: 'E-mail inválido.' });
    }

    this.agendar(() => this.enviarLink(limpo).catch((err) => {
      this.log.error('Erro ao enviar o e-mail de redefinição de senha:', err?.message ?? err);
    }));

    return { ok: true, message: MENSAGEM_ENVIADA };
  }

  /** Gera o token e manda o e-mail. Só para conta ativa. */
  async enviarLink(email) {
    const perfil = await this.profileRepository.buscarParaRecuperacao(email);
    if (!perfil || perfil.ativo === false) return { enviado: false };

    const token = await this.recuperacao.gerarToken(email);
    const link = `${this.site}/redefinir-senha?token=${encodeURIComponent(token)}`;
    const conteudo = emailRedefinirSenha({ nome: perfil.nome, link, validadeMinutos: this.validadeMinutos });

    return this.email.enviar({ para: email, ...conteudo, linkParaTeste: link });
  }

  /**
   * Troca a senha com o token do link.
   * @param {{ token?: string, novaSenha?: string, confirmarSenha?: string }} dados
   */
  async redefinir({ token, novaSenha, confirmarSenha } = {}) {
    if (!token || !TOKEN_REGEX.test(String(token))) {
      throw new AuthError('TOKEN_INVALIDO', MENSAGEM_LINK_INVALIDO);
    }

    const erros = {};
    if (!novaSenha || String(novaSenha).length < TAMANHO_MINIMO) erros.novaSenha = `A senha deve ter pelo menos ${TAMANHO_MINIMO} caracteres.`;
    else if (String(novaSenha).length > 72) erros.novaSenha = 'A senha pode ter no máximo 72 caracteres.';
    if (confirmarSenha !== novaSenha) erros.confirmarSenha = 'As senhas não coincidem.';
    if (Object.keys(erros).length) throw new AuthError('VALIDATION_ERROR', 'Verifique os campos destacados.', erros);

    let usuario;
    try {
      usuario = await this.recuperacao.conferirToken(String(token));
    } catch (cause) {
      throw new AuthError('SERVER_ERROR', 'Não foi possível conferir o link agora. Tente de novo.', {}, cause);
    }
    if (!usuario) throw new AuthError('TOKEN_INVALIDO', MENSAGEM_LINK_INVALIDO);

    try {
      await this.recuperacao.trocarSenha(usuario.id, novaSenha);
    } catch (cause) {
      throw new AuthError('SERVER_ERROR', 'Não foi possível salvar a senha nova. Peça outro link e tente de novo.', {}, cause);
    }

    // Daqui para baixo nada impede a troca: só registra.
    try {
      await this.recuperacao.encerrarSessoes(usuario.accessToken);
    } catch (err) {
      this.log.error('Senha redefinida, mas não foi possível encerrar as sessões antigas:', err?.message ?? err);
    }
    await this.avisarAdmin(usuario.email);

    return { ok: true, message: 'Senha alterada. Entre com a senha nova.' };
  }

  async avisarAdmin(email) {
    if (!this.painelAdmRepository) return;
    try {
      await this.painelAdmRepository.criarAviso({
        titulo: 'Senha redefinida por e-mail',
        descricao: `${email} criou uma senha nova pelo link de "Esqueci minha senha". Se não foi a própria pessoa, desative o acesso em Equipe.`,
        severidade: 'info',
      });
    } catch (err) {
      this.log.error('Erro ao registrar o aviso de senha redefinida:', err?.message ?? err);
    }
  }
}

module.exports = { RedefinicaoSenhaService, urlDoSite, MENSAGEM_ENVIADA, MENSAGEM_LINK_INVALIDO };

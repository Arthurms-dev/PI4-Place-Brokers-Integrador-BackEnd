'use strict';

// Vigia de segurança: transforma eventos suspeitos em avisos no painel do admin
// (tabela avisos_seguranca, aba "Avisos de segurança").
//
// Regras:
// - Nunca bloqueia nem atrasa a requisição: tudo roda em segundo plano e erro só vai para o log.
// - Conta eventos na memória (janela deslizante) e só avisa quando passa do limite.
// - O mesmo aviso não se repete por 30 minutos, para não lotar o painel.
// - IP aparece mascarado (LGPD): só os dois primeiros blocos.
//
// Mudanças de cargo e de acesso (ativar/desativar, aprovar/recusar) são avisadas
// direto pelo banco (migração 20261102_avisos_seguranca.sql), qualquer que seja a tela usada.

const MINUTO = 60 * 1000;
const SILENCIO_PADRAO = 30 * MINUTO;

const LIMITES = {
  acessoNegado: { vezes: 5, janela: 10 * MINUTO },
  spamFormulario: { vezes: 3, janela: 60 * MINUTO },
  documentos: { vezes: 20, janela: 10 * MINUTO },
};

function mascararIp(ip) {
  const limpo = String(ip ?? '').replace(/^::ffff:/, '');
  if (!limpo) return 'IP desconhecido';
  if (limpo.includes('.')) {
    const [a, b] = limpo.split('.');
    return `${a}.${b}.x.x`;
  }
  return `${limpo.split(':').slice(0, 2).join(':')}:…`;
}

const nomeDe = (user) => user?.nome || user?.email || 'Usuário sem nome';

function criarAvisoNoBanco(aviso) {
  // Carrega o repositório só quando precisa: os testes de middleware não tocam no Supabase.
  const { PainelAdmRepository } = require('../repositories/painelAdmRepository');
  return new PainelAdmRepository().criarAviso(aviso);
}

class VigiaSeguranca {
  /**
   * @param {{ criarAviso?: (a: {titulo:string, descricao:string, severidade:string}) => Promise<unknown>, agora?: () => number, log?: Console }} [deps]
   */
  constructor({ criarAviso = criarAvisoNoBanco, agora = Date.now, log = console } = {}) {
    this.criarAviso = criarAviso;
    this.agora = agora;
    this.log = log;
    this.eventos = new Map();
    this.ultimosAvisos = new Map();
  }

  /** Registra um evento e devolve quantos houve na janela. */
  contar(chave, janelaMs) {
    const t = this.agora();
    const lista = (this.eventos.get(chave) ?? []).filter((x) => t - x < janelaMs);
    lista.push(t);
    this.eventos.set(chave, lista);
    if (this.eventos.size > 5000) this.faxina(janelaMs);
    return lista.length;
  }

  faxina(janelaMs) {
    const t = this.agora();
    for (const [k, lista] of this.eventos) if (!lista.some((x) => t - x < janelaMs)) this.eventos.delete(k);
  }

  /** Cria o aviso, a não ser que o mesmo já tenha sido criado há pouco. Devolve true se criou. */
  async avisar({ chave, titulo, descricao, severidade = 'atencao', silencioMs = SILENCIO_PADRAO }) {
    const t = this.agora();
    const ultimo = this.ultimosAvisos.get(chave);
    if (ultimo && t - ultimo < silencioMs) return false;
    this.ultimosAvisos.set(chave, t);
    try {
      await this.criarAviso({ titulo, descricao, severidade });
      return true;
    } catch (err) {
      this.log.error('Não foi possível registrar o aviso de segurança:', err?.message ?? err);
      return false;
    }
  }

  /** Login bloqueado pelo limite de tentativas (por e-mail ou por conexão). */
  loginBloqueado({ email, ip }) {
    if (email) {
      return this.avisar({
        chave: `login-bloqueado:${email}`,
        titulo: 'Login bloqueado por excesso de tentativas',
        descricao: `O e-mail ${email} errou a senha 5 vezes em 15 minutos (conexão ${mascararIp(ip)}) e ficou bloqueado por 15 minutos. Se não foi a própria pessoa, pode ser alguém tentando adivinhar a senha.`,
        severidade: 'critico',
      });
    }
    return this.avisar({
      chave: `login-bloqueado-ip:${ip}`,
      titulo: 'Conexão bloqueada no login',
      descricao: `A conexão ${mascararIp(ip)} errou 30 logins em 15 minutos, em contas diferentes. Parece um robô testando senhas.`,
      severidade: 'critico',
    });
  }

  /** Conta desativada ou recusada tentou entrar com a senha certa. */
  contaBloqueadaTentouEntrar({ email, motivo }) {
    const situacao = motivo === 'recusado' ? 'teve o cadastro recusado' : 'está desativada';
    return this.avisar({
      chave: `conta-bloqueada:${email}`,
      titulo: 'Conta bloqueada tentou entrar',
      descricao: `${email} acertou a senha, mas a conta ${situacao}. Confira em Equipe se o acesso deve continuar bloqueado.`,
      severidade: 'info',
      silencioMs: 6 * 60 * MINUTO,
    });
  }

  /** Senha trocada pelo próprio usuário em Configurações. */
  senhaAlterada({ email }) {
    return this.avisar({
      chave: `senha-alterada:${email}`,
      titulo: 'Senha alterada',
      descricao: `${email} trocou a senha em Configurações.`,
      severidade: 'info',
      silencioMs: 0,
    });
  }

  /** Mesmo usuário tentando abrir área sem permissão várias vezes. */
  acessoNegado({ user, caminho }) {
    const id = user?.id ?? 'sem-id';
    const vezes = this.contar(`403:${id}`, LIMITES.acessoNegado.janela);
    if (vezes < LIMITES.acessoNegado.vezes) return Promise.resolve(false);
    return this.avisar({
      chave: `acesso-negado:${id}`,
      titulo: 'Tentativas de abrir área sem permissão',
      descricao: `${nomeDe(user)} (${user?.cargo ?? 'sem cargo'}) tentou ${vezes} vezes em 10 minutos abrir partes do sistema que o cargo não permite${caminho ? ` (última: ${String(caminho).split('?')[0]})` : ''}.`,
      severidade: 'atencao',
    });
  }

  /** Formulário de contato bloqueado pelo antispam. */
  spamNoFormulario({ ip }) {
    const vezes = this.contar(`spam:${ip}`, LIMITES.spamFormulario.janela);
    if (vezes < LIMITES.spamFormulario.vezes) return Promise.resolve(false);
    return this.avisar({
      chave: `spam:${ip}`,
      titulo: 'Robô tentando enviar o formulário do site',
      descricao: `O antispam barrou ${vezes} envios do formulário "Falar com especialista" da conexão ${mascararIp(ip)} na última hora. Nenhum desses virou lead.`,
      severidade: 'info',
      silencioMs: 6 * 60 * MINUTO,
    });
  }

  /** Muitos books/tabelas abertos pelo mesmo usuário em pouco tempo. */
  documentoAberto({ user }) {
    const id = user?.id ?? 'sem-id';
    const vezes = this.contar(`docs:${id}`, LIMITES.documentos.janela);
    if (vezes < LIMITES.documentos.vezes) return Promise.resolve(false);
    return this.avisar({
      chave: `docs:${id}`,
      titulo: 'Muitos books e tabelas abertos em pouco tempo',
      descricao: `${nomeDe(user)} (${user?.cargo ?? 'sem cargo'}) abriu ${vezes} documentos comerciais em 10 minutos. Pode ser alguém copiando o material da Place.`,
      severidade: 'atencao',
    });
  }
}

const vigia = new VigiaSeguranca();

/** Dispara sem esperar: o pedido do usuário nunca fica preso no aviso. */
const emSegundoPlano = (promessa) => { Promise.resolve(promessa).catch(() => {}); };

module.exports = { VigiaSeguranca, vigia, emSegundoPlano, mascararIp, LIMITES };

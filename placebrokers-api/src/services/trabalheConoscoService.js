'use strict';

const { randomUUID } = require('node:crypto');
const { AppError } = require('../errors/AppError');
const { normalizarTelefone } = require('../utils/telefone');

const AREAS = {
  corretor: 'Corretor(a) de imóveis',
  captacao: 'Captação de imóveis',
  administrativo: 'Administrativo',
  marketing: 'Marketing',
  outra: 'Outra área',
};
const UNIDADES = ['Recife', 'Caruaru', 'Paulista'];
const STATUS = ['novo', 'em_analise', 'entrevista', 'aprovado', 'recusado'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LINKEDIN_REGEX = /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/[^\s]+$/i;
const TAMANHO_MAXIMO_CURRICULO = 5 * 1024 * 1024;
// Política de privacidade (versão 17/11/2026): candidaturas ficam até 1 ano depois do envio.
const DIAS_DE_GUARDA = 365;

const texto = (v) => (typeof v === 'string' ? v.trim() : '');
const opcional = (v) => texto(v) || null;
const validacao = (erros) => new AppError('VALIDATION_ERROR', 'Verifique os campos destacados.', erros);

/** Confere o conteúdo, não só a extensão: todo PDF começa com "%PDF-". */
function ehPdf(arquivo) {
  return Boolean(
    arquivo?.buffer
    && arquivo.buffer.length > 5
    && arquivo.buffer.length <= TAMANHO_MAXIMO_CURRICULO
    && arquivo.buffer.subarray(0, 5).toString('latin1') === '%PDF-',
  );
}

/** O que o RH vê: sem o caminho interno do arquivo. */
function paraRh(c) {
  if (!c) return c;
  const { curriculo_path: caminho, ...resto } = c;
  return { ...resto, temCurriculo: Boolean(caminho) };
}

class TrabalheConoscoService {
  /** @param {{ candidaturaRepository: import('../repositories/candidaturaRepository').CandidaturaRepository }} deps */
  constructor({ candidaturaRepository }) {
    this.repo = candidaturaRepository;
  }

  async vagasAbertas() {
    const vagas = await this.repo.listarVagas({ apenasAbertas: true });
    return vagas.map(({ id, titulo, area, unidade, descricao }) => ({ id, titulo, area, unidade, descricao }));
  }

  /**
   * Candidatura pelo site. Responde igual para pessoa nova e repetida (não revela quem já se candidatou).
   * @param {object} dados campos do formulário (multipart)
   * @param {{ buffer: Buffer, mimetype?: string }|undefined} arquivo currículo em PDF (opcional)
   */
  async candidatar(dados = {}, arquivo) {
    const erros = {};
    const nome = texto(dados.nome);
    const email = texto(dados.email).toLowerCase();
    const fone = normalizarTelefone(dados.telefone);
    const vagaId = opcional(dados.vagaId);
    let area = texto(dados.area);
    const unidade = opcional(dados.unidade);
    const linkedin = opcional(dados.linkedin);

    if (nome.length < 2) erros.nome = 'Informe seu nome.';
    if (!EMAIL_REGEX.test(email)) erros.email = 'Informe um e-mail válido.';
    if (!fone.ok) erros.telefone = fone.erro;
    if (unidade && !UNIDADES.includes(unidade)) erros.unidade = 'Unidade inválida.';
    if (linkedin && !LINKEDIN_REGEX.test(linkedin)) erros.linkedin = 'Cole o link completo do seu perfil (https://linkedin.com/in/...).';
    if (texto(dados.mensagem).length > 1500) erros.mensagem = 'Use no máximo 1.500 caracteres.';
    if (String(dados.aceite) !== 'true') erros.aceite = 'Para continuar, autorize o uso dos seus dados.';
    if (!texto(dados.consentimentoVersao)) erros.aceite = erros.aceite ?? 'Versão da política ausente.';
    if (arquivo && !ehPdf(arquivo)) erros.curriculo = 'Envie o currículo em PDF de até 5 MB.';

    let vaga = null;
    if (vagaId) {
      vaga = UUID_REGEX.test(vagaId) ? await this.repo.buscarVaga(vagaId) : null;
      if (!vaga || !vaga.aberta) erros.vagaId = 'Essa vaga não está mais aberta. Escolha o banco de talentos.';
      else if (!area) area = vaga.area;
    }
    if (!AREAS[area]) erros.area = 'Escolha a área de interesse.';
    if (Object.keys(erros).length) throw validacao(erros);

    const linha = {
      vaga_id: vaga?.id ?? null,
      nome,
      email,
      telefone: fone.digitos,
      unidade,
      area,
      creci: opcional(dados.creci)?.slice(0, 30) ?? null,
      linkedin,
      mensagem: opcional(dados.mensagem),
      consentimento_versao: texto(dados.consentimentoVersao).slice(0, 20),
    };

    let caminho = null;
    if (arquivo) {
      caminho = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}.pdf`;
      await this.repo.subirCurriculo(caminho, arquivo.buffer);
    }

    const existente = await this.repo.buscarMesmaPessoa({ email, telefone: fone.digitos, vagaId: linha.vaga_id });
    try {
      if (existente) {
        await this.repo.atualizarCandidatura(existente.id, {
          ...linha,
          ...(caminho && { curriculo_path: caminho }),
          reenvios: (existente.reenvios ?? 0) + 1,
          // Reenviar conta como envio novo: o prazo de 1 ano recomeça daqui.
          criado_em: new Date().toISOString(),
        });
        if (caminho && existente.curriculo_path) {
          await this.repo.removerCurriculo(existente.curriculo_path).catch(() => {});
        }
      } else {
        await this.repo.criarCandidatura({ ...linha, curriculo_path: caminho });
      }
    } catch (err) {
      if (caminho) await this.repo.removerCurriculo(caminho).catch(() => {});
      throw err;
    }
    return { recebido: true };
  }

  /**
   * Apaga candidaturas (e currículos) com mais de 1 ano, como promete a política de privacidade.
   * Primeiro os arquivos, depois as linhas: se o Storage falhar, nada some pela metade.
   * @returns {Promise<number>} quantas foram apagadas
   */
  async limparAntigas({ agora = new Date() } = {}) {
    const limite = new Date(agora.getTime() - DIAS_DE_GUARDA * 24 * 60 * 60 * 1000).toISOString();
    let total = 0;
    for (;;) {
      const antigas = await this.repo.listarAntigas(limite, 500);
      if (!antigas.length) return total;
      await this.repo.removerCurriculos(antigas.map((c) => c.curriculo_path).filter(Boolean));
      await this.repo.removerCandidaturas(antigas.map((c) => c.id));
      total += antigas.length;
      if (antigas.length < 500) return total;
    }
  }

  // ---------- RH ----------

  async listarCandidaturas({ status, vagaId, area, unidade } = {}) {
    const erros = {};
    if (status && !STATUS.includes(status)) erros.status = 'Status inválido.';
    if (vagaId && vagaId !== 'banco' && !UUID_REGEX.test(vagaId)) erros.vagaId = 'Vaga inválida.';
    if (area && !AREAS[area]) erros.area = 'Área inválida.';
    if (unidade && !UNIDADES.includes(unidade)) erros.unidade = 'Unidade inválida.';
    if (Object.keys(erros).length) throw new AppError('VALIDATION_ERROR', 'Filtro inválido.', erros);
    const linhas = await this.repo.listarCandidaturas({ status, vagaId, area, unidade });
    return linhas.map(paraRh);
  }

  async buscar(id) {
    if (!UUID_REGEX.test(String(id))) throw new AppError('NOT_FOUND', 'Candidatura não encontrada.');
    const c = await this.repo.buscarCandidatura(id);
    if (!c) throw new AppError('NOT_FOUND', 'Candidatura não encontrada.');
    return c;
  }

  async atualizarCandidatura(id, { status, notas } = {}, usuario) {
    await this.buscar(id);
    const dados = {};
    if (status !== undefined) {
      if (!STATUS.includes(status)) throw validacao({ status: 'Status inválido.' });
      dados.status = status;
    }
    if (notas !== undefined) {
      if (notas !== null && typeof notas !== 'string') throw validacao({ notas: 'Anotação inválida.' });
      if ((notas ?? '').length > 3000) throw validacao({ notas: 'Use no máximo 3.000 caracteres.' });
      dados.notas = notas?.trim() || null;
    }
    if (!Object.keys(dados).length) throw new AppError('VALIDATION_ERROR', 'Nada para atualizar.');
    dados.atualizado_por = usuario.id;
    return paraRh(await this.repo.atualizarCandidatura(id, dados));
  }

  /** LGPD: a pessoa pediu para apagar os dados. Some o registro e o arquivo. */
  async removerCandidatura(id) {
    const c = await this.buscar(id);
    await this.repo.removerCandidatura(id);
    await this.repo.removerCurriculo(c.curriculo_path).catch(() => {});
  }

  async linkCurriculo(id) {
    const c = await this.buscar(id);
    if (!c.curriculo_path) throw new AppError('NOT_FOUND', 'Essa candidatura não tem currículo.');
    return { url: await this.repo.linkCurriculo(c.curriculo_path, 300), expiraEmSegundos: 300 };
  }

  async listarVagas() {
    return this.repo.listarVagas();
  }

  validarVaga(dados, parcial) {
    const erros = {};
    const linha = {};
    if (!parcial || dados.titulo !== undefined) {
      const titulo = texto(dados.titulo);
      if (titulo.length < 3 || titulo.length > 120) erros.titulo = 'Informe o título da vaga (3 a 120 caracteres).';
      linha.titulo = titulo;
    }
    if (!parcial || dados.area !== undefined) {
      if (!AREAS[dados.area]) erros.area = 'Escolha a área.';
      linha.area = dados.area;
    }
    if (dados.unidade !== undefined) {
      const unidade = opcional(dados.unidade);
      if (unidade && !UNIDADES.includes(unidade)) erros.unidade = 'Unidade inválida.';
      linha.unidade = unidade;
    }
    if (dados.descricao !== undefined) {
      const descricao = opcional(dados.descricao);
      if (descricao && descricao.length > 2000) erros.descricao = 'Use no máximo 2.000 caracteres.';
      linha.descricao = descricao;
    }
    if (dados.aberta !== undefined) {
      if (typeof dados.aberta !== 'boolean') erros.aberta = 'Deve ser verdadeiro ou falso.';
      linha.aberta = dados.aberta;
    }
    if (Object.keys(erros).length) throw validacao(erros);
    return linha;
  }

  async criarVaga(dados = {}, usuario) {
    return this.repo.criarVaga({ ...this.validarVaga(dados, false), criado_por: usuario.id });
  }

  async atualizarVaga(id, dados = {}) {
    if (!UUID_REGEX.test(String(id)) || !(await this.repo.buscarVaga(id))) throw new AppError('NOT_FOUND', 'Vaga não encontrada.');
    const linha = this.validarVaga(dados, true);
    if (!Object.keys(linha).length) throw new AppError('VALIDATION_ERROR', 'Nada para atualizar.');
    return this.repo.atualizarVaga(id, linha);
  }
}

/**
 * Roda a limpeza 1 minuto depois de a API subir e depois a cada 24 h (só no Render, que fica ligado).
 * @param {{ service: TrabalheConoscoService, log?: Console }} deps
 */
function agendarLimpezaCandidaturas({ service, log = console }) {
  const DIA = 24 * 60 * 60 * 1000;
  const rodar = async () => {
    try {
      const n = await service.limparAntigas();
      if (n) log.log(`Limpeza LGPD: ${n} candidatura(s) com mais de 1 ano apagada(s).`);
    } catch (err) {
      log.error('Limpeza das candidaturas antigas falhou:', err?.message ?? err);
    }
  };
  const primeira = setTimeout(rodar, 60 * 1000);
  const diaria = setInterval(rodar, DIA);
  primeira.unref?.();
  diaria.unref?.();
  return () => { clearTimeout(primeira); clearInterval(diaria); };
}

module.exports = {
  TrabalheConoscoService, agendarLimpezaCandidaturas, AREAS, UNIDADES, STATUS, ehPdf, TAMANHO_MAXIMO_CURRICULO, DIAS_DE_GUARDA,
};

'use strict';

const { AppError } = require('../errors/AppError');

const FUSO = 'America/Recife';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SETE_DIAS = 7 * 24 * 60 * 60 * 1000;

/** Data e hora de Recife: { dia: 'AAAA-MM-DD', minutos: minutos desde 0h, diaSemana: 0=domingo }. */
function relogioLocal(agora = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
    }).formatToParts(agora).map((p) => [p.type, p.value]),
  );
  const diaSemana = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(partes.weekday);
  return {
    dia: `${partes.year}-${partes.month}-${partes.day}`,
    minutos: Number(partes.hour) * 60 + Number(partes.minute),
    diaSemana,
  };
}

/**
 * Situação do horário da roleta (mesmas regras do banco):
 * seg a sex 07h–18h, sábado 08h–18h, domingo fechado; aptos são quem chega antes das 09h.
 */
function horario(agora = new Date()) {
  const { minutos, diaSemana } = relogioLocal(agora);
  if (diaSemana === 0) return { situacao: 'fechada', mensagem: 'Domingo não tem roleta. Os leads esperam a de segunda.' };
  const abre = diaSemana === 6 ? 8 * 60 : 7 * 60;
  if (minutos < abre) return { situacao: 'fechada', mensagem: `A roleta abre às ${diaSemana === 6 ? '08h' : '07h'}.` };
  if (minutos >= 18 * 60) return { situacao: 'fechada', mensagem: 'Depois das 18h os leads esperam a roleta de amanhã.' };
  if (minutos < 9 * 60) return { situacao: 'chegada', mensagem: 'Lista de chegada aberta até as 09h.' };
  return { situacao: 'distribuindo', mensagem: 'Lista fechada. Leads novos vão direto para a roleta.' };
}

function exigirUuid(id, campo = 'corretorId') {
  if (typeof id !== 'string' || !UUID.test(id)) {
    throw new AppError('VALIDATION_ERROR', 'Corretor inválido.', 400, { [campo]: 'Selecione um corretor válido.' });
  }
}

class RoletaService {
  /**
   * @param {object} deps
   * @param {import('../repositories/roletaRepository').RoletaRepository} deps.roletaRepository
   * @param {{ listarTimesDoGerente: Function, listarMembrosPorEquipes: Function, listarTimes: Function }} deps.equipeRepository
   * @param {() => Date} [deps.relogio]
   */
  constructor({ roletaRepository, equipeRepository, relogio = () => new Date() }) {
    this.repo = roletaRepository;
    this.equipes = equipeRepository;
    this.relogio = relogio;
  }

  /** Tenta distribuir sem derrubar quem chamou (a tela continua abrindo se der erro). */
  async _distribuirSemFalhar() {
    try {
      return await this.repo.distribuir();
    } catch (err) {
      console.error('[roleta] falha ao distribuir', err);
      return 0;
    }
  }

  /** Chamado depois que um lead chega pelo site: não espera nem propaga erro. */
  distribuirEmSegundoPlano() {
    this._distribuirSemFalhar();
  }

  /** Painel da recepção: lista de chegada, quem falta marcar e leads aguardando. */
  async hoje() {
    await this._distribuirSemFalhar();
    const agora = this.relogio();
    const { dia } = relogioLocal(agora);
    const [chegadas, iniciada, corretores, aguardando, entregues] = await Promise.all([
      this.repo.listarChegadas(dia),
      this.repo.buscarDia(dia),
      this.repo.listarCorretoresAtivos(),
      this.repo.listarAguardando(new Date(agora.getTime() - SETE_DIAS).toISOString()),
      this.repo.entreguesNoDia(dia),
    ]);
    const recebidos = {};
    for (const { corretor_id: id } of entregues) recebidos[id] = (recebidos[id] ?? 0) + 1;
    const chegou = new Set(chegadas.map((c) => c.corretor_id));
    return {
      dia,
      horario: horario(agora),
      iniciada: iniciada ? { em: iniciada.iniciada_em, automatica: !iniciada.iniciada_por } : null,
      chegadas: chegadas.map((c) => ({
        corretorId: c.corretor_id,
        nome: c.corretor?.nome ?? 'Corretor',
        ordem: c.ordem,
        chegouEm: c.chegou_em,
        apto: c.apto,
        recebidos: recebidos[c.corretor_id] ?? 0,
      })),
      faltam: corretores.filter((c) => !chegou.has(c.id)).map((c) => ({ id: c.id, nome: c.nome })),
      aguardando: aguardando.map((l) => ({
        id: l.id, nome: l.nome, origem: l.origem, criadoEm: l.criado_em,
        empreendimento: l.empreendimento ? { id: l.empreendimento.id, nome: l.empreendimento.nome } : null,
      })),
      entreguesHoje: entregues.length,
    };
  }

  async marcarChegada(corretorId, usuario) {
    exigirUuid(corretorId);
    let linha;
    try {
      linha = await this.repo.registrarChegada(corretorId, usuario?.id);
    } catch (err) {
      if (err?.message?.includes('CORRETOR_INVALIDO')) {
        throw new AppError('VALIDATION_ERROR', 'Esse corretor não está ativo.', 400, { corretorId: 'Corretor inativo ou não aprovado.' });
      }
      throw err;
    }
    return { ordem: linha.ordem, apto: linha.apto, chegouEm: linha.chegou_em, novo: Boolean(linha.novo) };
  }

  async definirApto(corretorId, apto) {
    exigirUuid(corretorId);
    if (typeof apto !== 'boolean') {
      throw new AppError('VALIDATION_ERROR', 'Informe se o corretor está apto.', 400, { apto: 'Use verdadeiro ou falso.' });
    }
    const { dia } = relogioLocal(this.relogio());
    const linha = await this.repo.atualizarApto(dia, corretorId, apto);
    if (!linha) throw new AppError('NOT_FOUND', 'Esse corretor não está na lista de hoje.', 404);
    if (apto) await this._distribuirSemFalhar();
    return { ordem: linha.ordem, apto: linha.apto, chegouEm: linha.chegou_em };
  }

  async removerChegada(corretorId) {
    exigirUuid(corretorId);
    const { dia } = relogioLocal(this.relogio());
    const removido = await this.repo.removerChegada(dia, corretorId);
    if (!removido) throw new AppError('NOT_FOUND', 'Esse corretor não está na lista de hoje.', 404);
    return { removido: true };
  }

  /** A recepção fecha a lista e começa a distribuir (às 09h isso também acontece sozinho). */
  async iniciar(usuario) {
    const agora = this.relogio();
    const h = horario(agora);
    if (h.situacao === 'fechada') throw new AppError('VALIDATION_ERROR', h.mensagem, 400);
    const { dia } = relogioLocal(agora);
    const chegadas = await this.repo.listarChegadas(dia);
    if (!chegadas.some((c) => c.apto)) {
      throw new AppError('VALIDATION_ERROR', 'Marque pelo menos um corretor apto antes de iniciar a roleta.', 400);
    }
    await this.repo.iniciarDia(dia, usuario?.id);
    return { distribuidos: await this.repo.distribuir() };
  }

  async distribuir() {
    return { distribuidos: await this.repo.distribuir() };
  }

  /** Posição do corretor na roleta de hoje. */
  async minha(usuario) {
    await this._distribuirSemFalhar();
    const agora = this.relogio();
    const { dia } = relogioLocal(agora);
    const [chegada, iniciada, entregues] = await Promise.all([
      this.repo.buscarChegada(dia, usuario.id),
      this.repo.buscarDia(dia),
      this.repo.entreguesNoDia(dia),
    ]);
    return {
      dia,
      horario: horario(agora),
      iniciada: Boolean(iniciada),
      chegada: chegada ? { ordem: chegada.ordem, chegouEm: chegada.chegou_em, apto: chegada.apto } : null,
      recebidosHoje: entregues.filter((l) => l.corretor_id === usuario.id).length,
    };
  }

  // ---- Focos (gerente define para a própria equipe; admin para todos) ----

  /** @private corretores que o usuário pode gerenciar */
  async _corretoresDo(usuario) {
    if (usuario.cargo === 'admin') {
      const [todos, times] = await Promise.all([this.repo.listarCorretoresAtivos(), this.equipes.listarTimes()]);
      return todos.map((c) => ({ id: c.id, nome: c.nome, equipe: times.find((t) => t.id === c.equipe_id)?.nome ?? null }));
    }
    const times = await this.equipes.listarTimesDoGerente(usuario.id);
    const membros = await this.equipes.listarMembrosPorEquipes(times.map((t) => t.id));
    return membros
      .filter((m) => m.cargo === 'corretor' && m.status === 'aprovado' && m.ativo && times.some((t) => t.id === m.equipe_id))
      .map((m) => ({ id: m.id, nome: m.nome, equipe: times.find((t) => t.id === m.equipe_id)?.nome ?? null }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  async listarFocos(usuario) {
    const corretores = await this._corretoresDo(usuario);
    const [focos, empreendimentos] = await Promise.all([
      this.repo.listarFocos(corretores.map((c) => c.id)),
      this.repo.listarEmpreendimentos(),
    ]);
    return {
      corretores: corretores.map((c) => ({
        ...c,
        focos: focos.filter((f) => f.corretor_id === c.id).map((f) => f.empreendimento_id),
      })),
      empreendimentos: empreendimentos
        .filter((e) => e.publicado !== false)
        .map((e) => ({ id: e.id, nome: e.nome, segmento: e.segmento ?? null, bairro: e.bairro ?? null, cidade: e.cidade ?? null })),
    };
  }

  async definirFocos(usuario, corretorId, empreendimentoIds) {
    exigirUuid(corretorId);
    if (!Array.isArray(empreendimentoIds) || empreendimentoIds.length > 100 || !empreendimentoIds.every((id) => typeof id === 'string' && UUID.test(id))) {
      throw new AppError('VALIDATION_ERROR', 'Lista de empreendimentos inválida.', 400, { empreendimentoIds: 'Selecione empreendimentos válidos.' });
    }
    const corretores = await this._corretoresDo(usuario);
    if (!corretores.some((c) => c.id === corretorId)) {
      throw new AppError('FORBIDDEN', 'Esse corretor não é da sua equipe.', 403);
    }
    const existentes = new Set((await this.repo.listarEmpreendimentos()).map((e) => e.id));
    const ids = [...new Set(empreendimentoIds)];
    if (!ids.every((id) => existentes.has(id))) {
      throw new AppError('VALIDATION_ERROR', 'Empreendimento não encontrado.', 400, { empreendimentoIds: 'Empreendimento não encontrado.' });
    }
    await this.repo.substituirFocos(corretorId, ids, usuario.id);
    return { corretorId, focos: ids };
  }
}

module.exports = { RoletaService, relogioLocal, horario };

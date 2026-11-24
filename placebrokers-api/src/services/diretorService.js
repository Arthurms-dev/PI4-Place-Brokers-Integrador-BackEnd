'use strict';

const { AppError } = require('../errors/AppError');

/**
 * Área do diretor (revisão de telas, 24/11/2026): equipes, gerentes e leads da própria diretoria.
 * Só leitura, com uma exceção pedida pela Place: repassar um lead quando o corretor não atende.
 * A roleta continua com a recepção.
 */
class DiretorService {
  /** @param {{ equipeRepository, leadRepository, leadService }} deps */
  constructor({ equipeRepository, leadRepository, leadService }) {
    this.equipeRepository = equipeRepository;
    this.leadRepository = leadRepository;
    this.leadService = leadService;
  }

  /** @param {{ id: string, diretoria_id?: string|null }} usuario */
  async contexto(usuario) {
    if (!usuario?.diretoria_id) return { diretoria: null, equipes: [], membros: [] };
    const [diretoria, equipes] = await Promise.all([
      this.equipeRepository.buscarDiretoria(usuario.diretoria_id),
      this.equipeRepository.listarTimesPorDiretoria(usuario.diretoria_id),
    ]);
    const [todos, gerentes] = await Promise.all([
      this.equipeRepository.listarMembrosPorEquipes(equipes.map((e) => e.id)),
      equipes.some((e) => e.gerente_id) ? this.equipeRepository.listar({ cargo: 'gerente' }) : [],
    ]);
    const membros = todos.filter((m) => m.cargo === 'corretor' && m.status === 'aprovado' && equipes.some((e) => e.id === m.equipe_id));
    return {
      diretoria: diretoria ? { id: diretoria.id, nome: diretoria.nome } : null,
      equipes: equipes.map((e) => {
        const gerente = gerentes.find((g) => g.id === e.gerente_id);
        return { id: e.id, nome: e.nome, sede: e.sede ?? null, gerente: gerente ? { id: gerente.id, nome: gerente.nome, telefone: gerente.telefone ?? null } : null };
      }),
      membros: membros.map((m) => ({ id: m.id, nome: m.nome, email: m.email, telefone: m.telefone ?? null, ativo: m.ativo, equipeId: m.equipe_id })),
    };
  }

  async leads(usuario) {
    const { membros } = await this.contexto(usuario);
    const ids = membros.map((m) => m.id);
    if (!ids.length) return [];
    return this.leadService.listarPorCorretores(ids);
  }

  /** Passa o lead para outro corretor ativo da mesma diretoria. */
  async repassar(usuario, leadId, corretorId) {
    const { membros } = await this.contexto(usuario);
    const ativos = new Set(membros.filter((m) => m.ativo).map((m) => m.id));
    if (!corretorId || !ativos.has(corretorId)) {
      throw new AppError('VALIDATION_ERROR', 'Escolha um corretor da sua diretoria.', 400, { corretorId: 'Corretor fora da sua diretoria.' });
    }
    const lead = await this.leadRepository.buscarPorId(leadId);
    if (!lead) throw new AppError('NOT_FOUND', 'Lead não encontrado.', 404);
    if (!lead.corretor?.id || !membros.some((m) => m.id === lead.corretor.id)) {
      throw new AppError('FORBIDDEN', 'Esse lead não está com um corretor da sua diretoria.', 403);
    }
    return this.leadService.atribuirCorretor(leadId, corretorId);
  }
}

module.exports = { DiretorService };

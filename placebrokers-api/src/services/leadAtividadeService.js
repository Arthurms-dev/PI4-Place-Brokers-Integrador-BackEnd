'use strict';
const { AppError } = require('../errors/AppError');
const TIPOS = ['ligacao','whatsapp','email','visita','observacao'];
function publico(row) {
  return {
    id: row.id, leadId: row.lead_id, autorId: row.autor_id,
    tipo: row.tipo, descricao: row.descricao,
    proximoContatoEm: row.proximo_contato_em, criadoEm: row.criado_em,
  };
}
class LeadAtividadeService {
  constructor({ leadRepository, atividadeRepository }) {
    this.leadRepository = leadRepository;
    this.atividadeRepository = atividadeRepository;
  }
  async autorizar(leadId, usuario) {
    const lead = await this.leadRepository.buscarPorId(leadId);
    if (!lead) throw new AppError('NOT_FOUND', 'Lead não encontrado.');
    if (usuario.cargo !== 'admin' &&
        (usuario.cargo !== 'corretor' || lead.corretor?.id !== usuario.id)) {
      throw new AppError('FORBIDDEN', 'Este lead não está atribuído a você.');
    }
    return lead;
  }
  async listar(leadId, usuario) {
    await this.autorizar(leadId, usuario);
    return (await this.atividadeRepository.listar(leadId)).map(publico);
  }
  async registrar(leadId, usuario, dados = {}) {
    await this.autorizar(leadId, usuario);
    const descricao = typeof dados.descricao === 'string' ? dados.descricao.trim() : '';
    const tipo = dados.tipo;
    const erros = {};
    if (!TIPOS.includes(tipo)) erros.tipo = 'Selecione um tipo de atividade.';
    if (!descricao || descricao.length > 2000) erros.descricao = 'Descreva o atendimento (1 a 2000 caracteres).';
    let proximoContato = null;
    if (dados.proximoContatoEm !== undefined && dados.proximoContatoEm !== null && dados.proximoContatoEm !== '') {
      const data = new Date(dados.proximoContatoEm);
      if (!Number.isFinite(data.getTime())) erros.proximoContatoEm = 'Data inválida.';
      else proximoContato = data.toISOString();
    }
    if (Object.keys(erros).length) throw new AppError('VALIDATION_ERROR', 'Verifique os campos.', erros);
    return publico(await this.atividadeRepository.criar({
      lead_id: leadId, autor_id: usuario.id, tipo,
      descricao, proximo_contato_em: proximoContato,
    }));
  }

  /**
   * Retornos marcados pelo corretor (lembretes): o próximo contato mais recente de cada lead
   * em aberto, de 7 dias atrás até 7 dias à frente. Some quando o corretor registra
   * qualquer atividade depois do horário marcado (o retorno foi feito).
   */
  async retornos(usuario, agora = new Date()) {
    if (usuario?.cargo !== 'corretor') throw new AppError('FORBIDDEN', 'Disponível apenas para corretores.');
    const dia = 24 * 60 * 60 * 1000;
    const desde = new Date(agora.getTime() - 7 * dia).toISOString();
    const ate = new Date(agora.getTime() + 7 * dia).toISOString();
    const linhas = await this.atividadeRepository.proximosDoCorretor(usuario.id, desde, ate);

    const porLead = new Map();
    for (const a of linhas) {
      if (!a.lead || ['convertido', 'perdido'].includes(a.lead.status)) continue;
      const atual = porLead.get(a.lead_id);
      if (!atual || new Date(a.criado_em) > new Date(atual.criado_em)) porLead.set(a.lead_id, a);
    }
    const ultima = await this.atividadeRepository.ultimaAtividadePorLead([...porLead.keys()]);

    return [...porLead.values()]
      .filter((a) => !(ultima[a.lead_id] && new Date(ultima[a.lead_id]) > new Date(a.proximo_contato_em)))
      .sort((x, y) => new Date(x.proximo_contato_em) - new Date(y.proximo_contato_em))
      .map((a) => ({
        atividadeId: a.id,
        leadId: a.lead_id,
        nome: a.lead.nome,
        telefone: a.lead.telefone,
        empreendimento: a.lead.empreendimento ? { id: a.lead.empreendimento.id, nome: a.lead.empreendimento.nome } : null,
        nota: a.descricao,
        proximoContatoEm: a.proximo_contato_em,
        atrasado: new Date(a.proximo_contato_em) < agora,
      }));
  }
}
module.exports = { LeadAtividadeService, TIPOS };

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
}
module.exports = { LeadAtividadeService, TIPOS };

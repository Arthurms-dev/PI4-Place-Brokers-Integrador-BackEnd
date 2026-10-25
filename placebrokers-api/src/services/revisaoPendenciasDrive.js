'use strict';

const { normalizarDocumento } = require('./documentosComerciaisAdmin');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validarRevisao(entrada) {
  const erros = {};
  const e = entrada && typeof entrada === 'object' && !Array.isArray(entrada) ? entrada : {};
  if (!['vincular', 'concluir', 'ignorar'].includes(e.acao)) erros.acao = 'Ação inválida.';
  if (!Number.isSafeInteger(e.revisao) || e.revisao < 0) erros.revisao = 'Atualize a lista antes de revisar.';
  let dados = {};
  if (e.acao === 'vincular') {
    if (!UUID.test(e.empreendimentoId ?? '')) erros.empreendimentoId = 'Selecione o empreendimento.';
    if (e.documentoId && !UUID.test(e.documentoId)) erros.documentoId = 'Documento inválido.';
    const documento = normalizarDocumento({
      tipo: e.tipo, titulo: e.titulo, fase: e.fase, validadeAte: e.validadeAte,
      // O arquivo vem da pendência no banco. O cliente não pode trocar sua origem.
      driveUrl: 'https://drive.google.com/file/d/ARQUIVO_FIXO_001/view',
    });
    Object.assign(erros, documento.erros);
    dados = { empreendimentoId: e.empreendimentoId, documentoId: e.documentoId || null,
      tipo: documento.dados?.tipo, titulo: documento.dados?.titulo,
      fase: documento.dados?.fase, validadeAte: documento.dados?.validade_ate };
  } else if (['concluir', 'ignorar'].includes(e.acao)) {
    const motivo = typeof e.motivo === 'string' ? e.motivo.trim() : '';
    if (motivo.length < 8 || motivo.length > 500) erros.motivo = 'Descreva a revisão entre 8 e 500 caracteres.';
    if (e.acao === 'concluir' && e.confirmarAprovacao !== true) {
      erros.confirmarAprovacao = 'Confirme a conferência do conteúdo, fase e validade.';
    }
    dados = { motivo, confirmarAprovacao: e.confirmarAprovacao === true };
  }
  return { erros, dados, acao: e.acao, revisao: e.revisao };
}

const FALHAS = {
  PENDENCIA_AUSENTE: [404, 'Pendência não encontrada.'],
  REVISAO_CONFLITO: [409, 'Esta pendência mudou. Atualize a lista antes de continuar.'],
  PENDENCIA_ENCERRADA: [409, 'Esta pendência já foi concluída ou ignorada.'],
  VINCULO_INCOMPLETO: [400, 'Salve o empreendimento, tipo e título antes de concluir.'],
  EMPREENDIMENTO_AUSENTE: [404, 'Empreendimento não encontrado.'],
  DOCUMENTO_INVALIDO: [409, 'O documento escolhido não pertence ao empreendimento. Revise o vínculo.'],
  DOCUMENTO_ALTERADO: [409, 'O documento atual mudou desde a conferência. Feche, reabra, compare e salve o vínculo novamente.'],
  DOCUMENTO_CONFLITO: [409, 'Já existe documento para este arquivo ou documento vigente para este tipo e fase. Selecione o registro que deseja atualizar.'],
  VALIDADE_EXPIRADA: [400, 'A validade informada já expirou. Não aprove como documento vigente.'],
  REVISAO_INVALIDA: [400, 'Dados de revisão inválidos.'],
  REVISOR_NAO_AUTORIZADO: [403, 'Somente um ADM ativo e aprovado pode revisar documentos.'],
};

module.exports = { validarRevisao, UUID, FALHAS };

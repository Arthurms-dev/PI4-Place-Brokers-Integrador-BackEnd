'use strict';

const { supabaseAdmin } = require('../config/supabase');
const { validarRevisao, UUID, FALHAS } = require('../services/revisaoPendenciasDrive');
const LIMIT = 100;
const COLUNAS = [
  'id', 'arquivo_nome', 'motivo', 'tipo', 'fase', 'status',
  'drive_file_id', 'drive_modificado_em', 'criado_em', 'empreendimento_id', 'documento_id',
  'revisao', 'titulo_revisado', 'validade_revisada', 'revisado_por', 'revisado_em', 'motivo_revisao',
].join(',');
const DRIVE_ID = /^[A-Za-z0-9_-]{10,}$/;

async function listar(req, res) {
  try {
    const status = req.query?.status ?? 'pendente';
    if (!['pendente', 'resolvido', 'ignorado'].includes(status)) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Situação de pendência inválida.' });
    }
    const { data, error } = await supabaseAdmin
      .from('empreendimento_documentos_pendencias')
      .select(COLUNAS)
      .eq('status', status)
      .order('criado_em', { ascending: false })
      .limit(LIMIT + 1);
    if (error) throw error;

    const registros = data ?? [];
    const limitado = registros.length > LIMIT;
    const ativos = registros.slice(0, LIMIT);
    const ids = [...new Set(ativos.map((p) => p.empreendimento_id).filter(Boolean))];
    let nomesPorId = new Map();

    if (ids.length) {
      const { data: empresas, error: erroEmpresas } = await supabaseAdmin
        .from('empreendimentos')
        .select('id,nome')
        .in('id', ids);
      if (erroEmpresas) throw erroEmpresas;
      nomesPorId = new Map((empresas ?? []).map((e) => [e.id, e.nome]));
    }

    const itens = ativos.map((p) => ({
      id: p.id,
      arquivoNome: p.arquivo_nome,
      motivo: p.motivo,
      tipo: p.tipo,
      fase: p.fase,
      status: p.status,
      criadoEm: p.criado_em,
      modificadoEm: p.drive_modificado_em,
      empreendimentoId: p.empreendimento_id,
      empreendimentoNome: nomesPorId.get(p.empreendimento_id) ?? null,
      documentoId: p.documento_id,
      revisao: p.revisao,
      tituloRevisado: p.titulo_revisado,
      validadeRevisada: p.validade_revisada,
      revisadoPor: p.revisado_por,
      revisadoEm: p.revisado_em,
      motivoRevisao: p.motivo_revisao,
      driveUrl: DRIVE_ID.test(p.drive_file_id ?? '')
        ? `https://drive.google.com/file/d/${p.drive_file_id}/view`
        : null,
    }));

    return res.status(200).json({ itens, totalExibido: itens.length, haMais: limitado });
  } catch (erro) {
    console.error('Erro ao listar pendências do Drive:', erro?.message ?? erro);
    return res.status(500).json({
      code: 'SERVER_ERROR',
      message: 'Não foi possível consultar as pendências do Google Drive.',
    });
  }
}

async function revisar(req, res) {
  if (!req.user || req.user.cargo !== 'admin') {
    return res.status(req.user ? 403 : 401).json({ code: 'FORBIDDEN', message: 'Faça login como administrador.' });
  }
  if (!UUID.test(req.params.pendenciaId ?? '')) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Pendência inválida.' });
  }
  const validado = validarRevisao(req.body);
  if (Object.keys(validado.erros).length) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Confira os campos da revisão.', fieldErrors: validado.erros });
  }
  try {
    const { data, error } = await supabaseAdmin.rpc('revisar_pendencia_drive', {
      p_id: req.params.pendenciaId,
      p_revisor: req.userId ?? req.user.id,
      p_revisao: validado.revisao, p_acao: validado.acao, p_dados: validado.dados,
    });
    if (error) {
      const falha = FALHAS[error.message];
      if (falha) return res.status(falha[0]).json({ code: error.message, message: falha[1] });
      throw error;
    }
    return res.status(200).json(data);
  } catch (erro) {
    console.error('Erro ao revisar pendência do Drive:', erro?.message ?? erro);
    return res.status(500).json({ code: 'SERVER_ERROR', message: 'Não foi possível salvar a revisão. Confira a migração do banco e tente novamente.' });
  }
}

module.exports = { listar, revisar };

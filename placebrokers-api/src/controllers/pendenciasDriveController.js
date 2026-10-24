'use strict';

const { supabaseAdmin } = require('../config/supabase');
const LIMIT = 100;
const COLUNAS = [
  'id', 'arquivo_nome', 'motivo', 'tipo', 'fase', 'status',
  'drive_file_id', 'drive_modificado_em', 'criado_em', 'empreendimento_id', 'documento_id',
].join(',');
const DRIVE_ID = /^[A-Za-z0-9_-]{10,}$/;

async function listar(req, res) {
  try {
    const { data, error } = await supabaseAdmin
      .from('empreendimento_documentos_pendencias')
      .select(COLUNAS)
      .eq('status', 'pendente')
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

module.exports = { listar };

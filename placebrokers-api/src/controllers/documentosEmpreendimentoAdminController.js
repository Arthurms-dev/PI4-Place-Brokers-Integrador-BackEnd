'use strict';

const { supabaseAdmin } = require('../config/supabase');
const { extrairIdDrive, normalizarDocumento, conflitoDeFase } = require('../services/documentosComerciaisAdmin');

const TABELA = 'empreendimento_documentos';
const COLUNAS = 'id,empreendimento_id,tipo,fase,titulo,drive_file_id,status,fonte_atualizada_em,validade_ate';

function falha(res, erro) {
  console.error('Falha na administração de documentos:', erro?.message ?? erro);
  return res.status(500).json({ code: 'SERVER_ERROR', message: 'Falha ao gerenciar documentos comerciais.' });
}

async function existeEmpreendimento(id) {
  const { data, error } = await supabaseAdmin.from('empreendimentos').select('id').eq('id', id).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function listarTodos(id) {
  const { data, error } = await supabaseAdmin.from(TABELA)
    .select(COLUNAS).eq('empreendimento_id', id).order('tipo', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

function visaoAdmin(row) {
  // Nunca retornar service role; o ID do Drive só é exibido ao ADM autenticado.
  return { ...row, driveUrl: /^[-\w]{10,}$/.test(row.drive_file_id || '')
    ? `https://drive.google.com/file/d/${row.drive_file_id}/view`
    : null };
}

async function listar(req, res) {
  try {
    if (!(await existeEmpreendimento(req.params.id))) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Empreendimento não encontrado.' });
    }
    const lista = await listarTodos(req.params.id);
    return res.status(200).json(lista.map(visaoAdmin));
  } catch (erro) { return falha(res, erro); }
}

async function gravar(req, res, editando) {
  try {
    const id = req.params.id;
    if (!(await existeEmpreendimento(id))) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Empreendimento não encontrado.' });
    }
    const { dados, erros } = normalizarDocumento(req.body);
    if (Object.keys(erros).length) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Verifique os campos.', fieldErrors: erros });
    }
    const lista = await listarTodos(id);
    const anterior = editando ? lista.find((doc) => doc.id === req.params.docId) : null;
    if (editando && !anterior) return res.status(404).json({ code: 'NOT_FOUND', message: 'Documento não encontrado.' });

    const hoje = new Date().toISOString().slice(0, 10);
    const atualizado = { ...dados, status: anterior?.status ?? 'aprovado' };
    if (atualizado.status === 'aprovado' &&
        (!atualizado.validade_ate || atualizado.validade_ate >= hoje) &&
        conflitoDeFase(lista, atualizado, anterior?.id, hoje)) {
      return res.status(409).json({
        code: 'DOCUMENT_CONFLICT',
        message: 'Já existe documento aprovado e vigente para este tipo e fase. Edite o documento existente.',
      });
    }

    // Não copiar a hora atual para fonte_atualizada_em: não sabemos quando o PDF foi alterado no Drive.
    let consulta;
    if (editando) {
      consulta = supabaseAdmin.from(TABELA).update({
        tipo: atualizado.tipo,
        titulo: atualizado.titulo,
        fase: atualizado.fase,
        drive_file_id: atualizado.drive_file_id,
        validade_ate: atualizado.validade_ate,
        // Ao trocar o arquivo, removemos a data de origem anterior, que pode estar incorreta.
        ...(anterior.drive_file_id !== atualizado.drive_file_id ? { fonte_atualizada_em: null } : {}),
      }).eq('id', anterior.id).eq('empreendimento_id', id).select(COLUNAS).maybeSingle();
    } else {
      consulta = supabaseAdmin.from(TABELA).insert({
        empreendimento_id: id, ...atualizado,
      }).select(COLUNAS).maybeSingle();
    }
    const { data, error } = await consulta;
    if (error) throw error;
    if (!data) return res.status(404).json({ code: 'NOT_FOUND', message: 'Documento não encontrado.' });
    return res.status(editando ? 200 : 201).json(visaoAdmin(data));
  } catch (erro) { return falha(res, erro); }
}

async function criar(req, res) { return gravar(req, res, false); }
async function atualizar(req, res) { return gravar(req, res, true); }

module.exports = { listar, criar, atualizar };

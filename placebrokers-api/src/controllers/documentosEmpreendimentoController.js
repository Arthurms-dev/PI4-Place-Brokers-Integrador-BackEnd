'use strict';

const { supabaseAdmin } = require('../config/supabase');
const { EmpreendimentoRepository } = require('../repositories/empreendimentoRepository');
const { EmpreendimentoService, usuarioPodeVerRascunhos } = require('../services/empreendimentoService');
const { UploadService } = require('../services/uploadService');

const repository = new EmpreendimentoRepository();
const servicoLegado = new EmpreendimentoService({
  empreendimentoRepository: repository,
  uploadService: new UploadService(),
});

const COLUNAS = 'id,empreendimento_id,tipo,fase,titulo,drive_file_id,status,fonte_atualizada_em,validade_ate';
const driveIdValido = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{10,}$/.test(id);
const falha = (res, err) => {
  console.error('Falha na consulta de documentos:', err?.message ?? err);
  return res.status(500).json({ code: 'SERVER_ERROR', message: 'Não foi possível consultar os documentos.' });
};

function legados(row, tiposPresentes) {
  const lista = [];
  if (row.book_url && !tiposPresentes.has('book')) {
    lista.push({ id: null, tipo: 'book', titulo: 'Book do empreendimento', fase: null, origem: 'legado' });
  }
  if (row.tabela_url && !tiposPresentes.has('tabela')) {
    lista.push({ id: null, tipo: 'tabela', titulo: 'Tabela de preços', fase: null, origem: 'legado' });
  }
  return lista;
}

async function listar(req, res) {
  try {
    const emp = await repository.buscarPorId(req.params.id);
    if (!emp || (!emp.publicado && !usuarioPodeVerRascunhos(req.user))) return res.status(404).json({ code: 'NOT_FOUND', message: 'Empreendimento não encontrado.' });
    const { data, error } = await supabaseAdmin
      .from('empreendimento_documentos')
      .select(COLUNAS)
      .eq('empreendimento_id', emp.id)
      .eq('status', 'aprovado')
      .order('tipo', { ascending: true });
    // Permite atualizar o código antes da migração sem quebrar os nove books existentes.
    if (error && error.code !== '42P01' && error.code !== 'PGRST205') throw error;
    const hoje = new Date().toISOString().slice(0, 10);
    const aprovados = (error ? [] : data ?? [])
      .filter(d => !d.validade_ate || d.validade_ate >= hoje)
      .map(d => ({
        id: d.id, tipo: d.tipo, titulo: d.titulo, fase: d.fase,
        origem: 'drive', atualizadoEm: d.fonte_atualizada_em,
      }));
    const tipos = new Set(aprovados.map(d => d.tipo));
    return res.status(200).json([...legados(emp, tipos), ...aprovados]);
  } catch (err) {
    return falha(res, err);
  }
}

async function abrir(req, res) {
  try {
    const emp = await repository.buscarPorId(req.params.id);
    if (!emp || (!emp.publicado && !usuarioPodeVerRascunhos(req.user))) return res.status(404).json({ code: 'NOT_FOUND', message: 'Empreendimento não encontrado.' });
    const { data, error } = await supabaseAdmin.from('empreendimento_documentos')
      .select(COLUNAS).eq('id', req.params.docId)
      .eq('empreendimento_id', emp.id).eq('status', 'aprovado').maybeSingle();
    if (error) throw error;
    const hoje = new Date().toISOString().slice(0, 10);
    if (!data || (data.validade_ate && data.validade_ate < hoje) || !driveIdValido(data.drive_file_id)) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Documento não disponível.' });
    }
    // Atenção: o link do Drive respeita as permissões definidas no arquivo original.
    // Não é proxy privado; use a integração de streaming autenticado antes de revogar links públicos no Drive.
    return res.status(200).json({ url: `https://drive.google.com/file/d/${data.drive_file_id}/view`, expiraEmSegundos: null });
  } catch (err) {
    return falha(res, err);
  }
}

module.exports = { listar, abrir, legados };

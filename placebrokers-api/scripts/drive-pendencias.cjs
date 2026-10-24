'use strict';

// Analisa metadados sem alterar Supabase ou Google Drive.
const DRIVE_ID = /^[A-Za-z0-9_-]{10,}$/;
const LIMIAR_MS = 5_000;

function idDeLinkLegado(endereco) {
  if (typeof endereco !== 'string') return null;
  try {
    const url = new URL(endereco.trim());
    if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com' || url.username || url.password || url.port) return null;
    const resultado = /^\/file\/d\/([A-Za-z0-9_-]+)\/(?:view|preview)\/?$/.exec(url.pathname);
    return resultado && DRIVE_ID.test(resultado[1]) ? resultado[1] : null;
  } catch { return null; }
}

function dataIso(valor) {
  if (typeof valor !== 'string' || !valor) return null;
  const milissegundos = Date.parse(valor);
  return Number.isFinite(milissegundos) ? new Date(milissegundos).toISOString() : null;
}

function prepararPendencias({ arquivos = [], documentos = [], empreendimentos = [] }) {
  const docsPorId = new Map();
  for (const doc of documentos) {
    if (!DRIVE_ID.test(doc.drive_file_id ?? '')) continue;
    const lista = docsPorId.get(doc.drive_file_id) ?? [];
    lista.push(doc);
    docsPorId.set(doc.drive_file_id, lista);
  }

  const linksLegados = new Map();
  for (const emp of empreendimentos) {
    for (const campo of ['book_url', 'tabela_url']) {
      const driveId = idDeLinkLegado(emp[campo]);
      if (driveId) linksLegados.set(driveId, (linksLegados.get(driveId) ?? 0) + 1);
    }
  }

  const pendencias = [];
  const avisos = [];
  const vistos = new Set();
  for (const arquivo of arquivos) {
    if (arquivo.mimeType !== 'application/pdf') continue;
    if (!DRIVE_ID.test(arquivo.id ?? '')) {
      avisos.push({ arquivo: arquivo.name, motivo: 'ID de arquivo inválido; não incluído.' });
      continue;
    }
    if (vistos.has(arquivo.id)) continue;
    vistos.add(arquivo.id);
    const modificadoEm = dataIso(arquivo.modifiedTime);
    if (!modificadoEm) {
      avisos.push({ arquivo: arquivo.name, motivo: 'Data de modificação ausente ou inválida; não incluído.' });
      continue;
    }

    const docs = docsPorId.get(arquivo.id) ?? [];
    const vinculados = docs.filter((doc) => doc.status === 'aprovado');
    const legados = linksLegados.get(arquivo.id) ?? 0;
    let motivo = null;
    let doc = null;

    if (docs.length > 1) {
      motivo = 'VINCULOS_REPETIDOS';
    } else if (vinculados.length === 1) {
      doc = vinculados[0];
      const dataReferencia = dataIso(doc.fonte_atualizada_em);
      if (!dataReferencia) motivo = 'SEM_DATA_REFERENCIA';
      else if (Date.parse(modificadoEm) - Date.parse(dataReferencia) > LIMIAR_MS) {
        motivo = 'ARQUIVO_MODIFICADO';
      }
    } else if (docs.length === 1) {
      // Rascunho ou arquivado: não tratar como novo nem aprová-lo automaticamente.
      continue;
    } else if (legados > 0) {
      // Os livros antigos são vínculos legítimos. Ainda não existe data-base para comparar versões.
      if (legados > 1) motivo = 'LEGADO_REPETIDO';
      else continue;
    } else {
      // Sem vínculo seguro: não inferir empreendimento, tipo ou fase pelo nome do arquivo.
      motivo = 'PDF_NOVO_SEM_VINCULO';
    }

    if (!motivo) continue;
    pendencias.push({
      drive_file_id: arquivo.id,
      drive_pasta_id: arquivo.pastaId ?? null,
      arquivo_nome: String(arquivo.name ?? '').slice(0, 500),
      drive_modificado_em: modificadoEm,
      motivo,
      tipo: doc?.tipo === 'book' || doc?.tipo === 'tabela' ? doc.tipo : null,
      fase: doc?.fase ?? null,
      empreendimento_id: doc?.empreendimento_id ?? null,
      documento_id: doc?.id ?? null,
    });
  }
  return { pendencias, avisos };
}

module.exports = { prepararPendencias, idDeLinkLegado, dataIso };

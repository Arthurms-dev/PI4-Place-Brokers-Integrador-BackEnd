'use strict';

const PADRAO_ID = /^[A-Za-z0-9_-]{10,}$/;
const TIPOS = new Set(['book', 'tabela']);
const ISO_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Converte apenas URLs de arquivo compatíveis com o leitor atual da API. */
function extrairIdDrive(endereco) {
  if (typeof endereco !== 'string') return null;
  try {
    const url = new URL(endereco.trim());
    if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com') return null;
    if (url.username || url.password || url.port) return null;
    let id = null;
    const m = /^\/file\/d\/([A-Za-z0-9_-]+)\/(?:view|preview)\/?$/.exec(url.pathname);
    if (m) id = m[1];
    if (url.pathname === '/open') id = url.searchParams.get('id');
    return typeof id === 'string' && PADRAO_ID.test(id) ? id : null;
  } catch { return null; }
}

function dataValida(valor) {
  if (!ISO_DATA.test(valor)) return false;
  const data = new Date(`${valor}T00:00:00.000Z`);
  return Number.isFinite(data.getTime()) && data.toISOString().slice(0, 10) === valor;
}

function normalizarDocumento(entrada) {
  const erros = {};
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
    return { erros: { dados: 'Informe os dados do documento.' } };
  }
  const tipo = typeof entrada.tipo === 'string' ? entrada.tipo.trim() : '';
  const titulo = typeof entrada.titulo === 'string' ? entrada.titulo.trim() : '';
  const fase = typeof entrada.fase === 'string' ? entrada.fase.trim() : '';
  const drive_file_id = extrairIdDrive(entrada.driveUrl);
  const validade_ate = entrada.validadeAte || null;
  if (!TIPOS.has(tipo)) erros.tipo = 'Selecione book ou tabela.';
  if (titulo.length < 2 || titulo.length > 150) erros.titulo = 'Informe um título entre 2 e 150 caracteres.';
  if (fase.length > 80) erros.fase = 'A fase deve ter até 80 caracteres.';
  if (!drive_file_id) erros.driveUrl = 'Cole um link válido do arquivo no Google Drive.';
  if (validade_ate !== null && (typeof validade_ate !== 'string' || !dataValida(validade_ate))) {
    erros.validadeAte = 'Informe uma data válida.';
  }
  return {
    erros,
    dados: { tipo, titulo, fase: fase || null, drive_file_id, validade_ate },
  };
}

function aprovadoVigente(doc, hoje) {
  return doc.status === 'aprovado' && (!doc.validade_ate || doc.validade_ate >= hoje);
}

function conflitoDeFase(itens, candidato, ignorarId, hoje) {
  return itens.some((doc) =>
    doc.id !== ignorarId &&
    aprovadoVigente(doc, hoje) &&
    doc.tipo === candidato.tipo &&
    String(doc.fase ?? '').trim().toLocaleLowerCase('pt-BR') ===
      String(candidato.fase ?? '').trim().toLocaleLowerCase('pt-BR')
  );
}

module.exports = { extrairIdDrive, normalizarDocumento, dataValida, conflitoDeFase };

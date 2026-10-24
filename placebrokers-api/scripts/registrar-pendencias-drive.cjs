#!/usr/bin/env node
'use strict';

/**
 * Etapa 3A: detectar alterações no Drive e registrar SOMENTE avisos de revisão.
 * Sem argumentos: simulação integral, sem escritas.
 * Com --apply: grava registros em empreendimento_documentos_pendencias.
 * NUNCA modifica empreendimento_documentos, empreendimentos ou Google Drive.
 * Executar na raiz do placebrokers-api.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { prepararPendencias } = require('./drive-pendencias.cjs');

const args = process.argv.slice(2);
if (args.some((a) => a !== '--apply') || args.filter((a) => a === '--apply').length > 1) {
  console.error('Uso: node scripts/registrar-pendencias-drive.cjs [--apply]');
  process.exit(2);
}
const aplicar = args.includes('--apply');

function configuracao() {
  const env = process.env;
  const faltando = ['GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_DRIVE_DOCUMENTOS_FOLDER_IDS',
    'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((n) => !env[n]);
  if (faltando.length) throw new Error(`Falta configurar ${faltando.join(', ')} no .env.`);

  const credenciais = JSON.parse(fs.readFileSync(path.resolve(env.GOOGLE_APPLICATION_CREDENTIALS), 'utf8'));
  if (credenciais.type !== 'service_account' || !credenciais.client_email || !credenciais.private_key) {
    throw new Error('Credencial de service account inválida.');
  }

  const pastas = [...new Set(env.GOOGLE_DRIVE_DOCUMENTOS_FOLDER_IDS.split(',').map((s) => s.trim()).filter(Boolean))];
  if (!pastas.length || pastas.some((s) => !/^[A-Za-z0-9_-]{10,}$/.test(s))) {
    throw new Error('GOOGLE_DRIVE_DOCUMENTOS_FOLDER_IDS contém pasta inválida.');
  }
  return { credenciais, pastas };
}

const base64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
async function tokenDrive(credenciais) {
  const iat = Math.floor(Date.now() / 1000);
  const header = base64({ alg: 'RS256', typ: 'JWT' });
  const payload = base64({
    iss: credenciais.client_email,
    scope: 'https://www.googleapis.com/auth/drive.metadata.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat, exp: iat + 3600,
  });
  const jwt = `${header}.${payload}.${crypto.sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), credenciais.private_key).toString('base64url')}`;
  const resposta = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
    signal: AbortSignal.timeout(20000),
  });
  if (!resposta.ok) throw new Error(`Falha ao autenticar no Drive (HTTP ${resposta.status}).`);
  const data = await resposta.json();
  if (!data.access_token) throw new Error('Sem token de acesso do Drive.');
  return data.access_token;
}

async function listarPasta(idPasta, token) {
  const arquivos = [];
  let nextPageToken;
  do {
    const q = new URLSearchParams({
      q: `'${idPasta}' in parents and trashed = false`,
      fields: 'nextPageToken,incompleteSearch,files(id,name,mimeType,modifiedTime)',
      pageSize: '1000', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
    });
    if (nextPageToken) q.set('pageToken', nextPageToken);
    const resposta = await fetch(`https://www.googleapis.com/drive/v3/files?${q}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!resposta.ok) throw new Error(`Falha ao consultar a pasta ${idPasta.slice(0, 6)}… (HTTP ${resposta.status}).`);
    const dados = await resposta.json();
    if (dados.incompleteSearch) throw new Error('Drive retornou uma busca incompleta; nenhuma gravação foi feita.');
    arquivos.push(...(dados.files ?? []).map((item) => ({ ...item, pastaId: idPasta })));
    nextPageToken = dados.nextPageToken;
  } while (nextPageToken);
  return arquivos;
}

async function executar() {
  const { credenciais, pastas } = configuracao();
  const banco = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } });

  const [emp, docs] = await Promise.all([
    banco.from('empreendimentos').select('id,nome,book_url,tabela_url'),
    banco.from('empreendimento_documentos')
      .select('id,empreendimento_id,drive_file_id,tipo,fase,status,fonte_atualizada_em'),
  ]);
  if (emp.error) throw new Error(`Supabase/empreendimentos: ${emp.error.message}`);
  if (docs.error) throw new Error(`Supabase/documentos: ${docs.error.message}`);

  const token = await tokenDrive(credenciais);
  const encontrados = [];
  for (const id of pastas) {
    const arquivos = await listarPasta(id, token);
    console.log(`Pasta ${id.slice(0, 6)}…: ${arquivos.length} arquivos listados.`);
    encontrados.push(...arquivos);
  }
  const { pendencias, avisos } = prepararPendencias({
    arquivos: encontrados, documentos: docs.data ?? [], empreendimentos: emp.data ?? [],
  });

  console.table(pendencias.map((p) => ({
    arquivo: p.arquivo_nome, motivo: p.motivo, tipo: p.tipo ?? 'A DEFINIR',
    fase: p.fase ?? 'A DEFINIR', documento: p.documento_id ? 'JÁ VINCULADO' : 'SEM VÍNCULO SEGURO',
  })));
  for (const aviso of avisos) console.warn(`REVISAR: ${aviso.arquivo}: ${aviso.motivo}`);
  console.log(`Pendências identificadas: ${pendencias.length}. Avisos de metadados: ${avisos.length}.`);

  if (!aplicar) {
    console.log('MODO SIMULAÇÃO: nenhuma alteração no banco. Para registrar pendências, use --apply após revisar a lista.');
    return;
  }

  // Falha se a migração ainda não existe. Sem modificar registros comerciais.
  const { error: erroTabela } = await banco.from('empreendimento_documentos_pendencias').select('id').limit(1);
  if (erroTabela) throw new Error(`Migração da fila de pendências ausente ou inválida: ${erroTabela.message}`);

  if (!pendencias.length) {
    console.log('Nenhuma pendência para inserir. Banco não modificado.');
    return;
  }

  if (pendencias.length > 100) {
    throw new Error('Mais de 100 pendências detectadas: conferir o catálogo antes de gravar.');
  }

  const { data, error } = await banco.from('empreendimento_documentos_pendencias')
    .upsert(pendencias, {
      onConflict: 'drive_file_id,drive_modificado_em',
      ignoreDuplicates: true,
    }).select('id');
  if (error) throw new Error(`Erro ao gravar pendências: ${error.message}`);
  console.log(`${(data ?? []).length} novos avisos de revisão registrados (sem aprovar documentos).`);
}

executar().catch((err) => { console.error(`ERRO: ${err.message}`); process.exitCode = 1; });

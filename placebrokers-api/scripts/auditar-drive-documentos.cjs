#!/usr/bin/env node
'use strict';

/**
 * Place Brokers: auditoria APENAS DE LEITURA.
 * NÃO altera Google Drive, Supabase ou status dos documentos.
 * Executar da raiz placebrokers-api:
 *   node scripts/auditar-drive-documentos.cjs
 *
 * Pré-requisitos:
 *  - GOOGLE_APPLICATION_CREDENTIALS: caminho absoluto do JSON da service account,
 *    mantido FORA do repositório
 *  - GOOGLE_DRIVE_DOCUMENTOS_FOLDER_IDS: IDs de pastas separados por vírgula
 *  - SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env local
 *  - Drive API ativada e service account com acesso de leitura às pastas
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const { compararDocumentosDrive } = require('./drive-documentos-diff.cjs');

const ESCOPO = 'https://www.googleapis.com/auth/drive.metadata.readonly';

function validarConfiguracao() {
  const ausentes = [
    'GOOGLE_APPLICATION_CREDENTIALS',
    'GOOGLE_DRIVE_DOCUMENTOS_FOLDER_IDS',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ].filter((chave) => !process.env[chave]);

  if (ausentes.length) {
    throw new Error(`Configuração ausente: ${ausentes.join(', ')}. Confira o .env local.`);
  }

  const credenciaisPath = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  const credenciais = JSON.parse(fs.readFileSync(credenciaisPath, 'utf8'));
  if (!credenciais.client_email || !credenciais.private_key ||
      credenciais.type !== 'service_account') {
    throw new Error('O JSON fornecido não é uma credencial válida de service account.');
  }

  const idsPasta = [...new Set(
    process.env.GOOGLE_DRIVE_DOCUMENTOS_FOLDER_IDS
      .split(',').map((id) => id.trim()).filter(Boolean)
  )];

  if (!idsPasta.length || idsPasta.some((id) => !/^[A-Za-z0-9_-]{10,}$/.test(id))) {
    throw new Error('IDs de pastas inválidos em GOOGLE_DRIVE_DOCUMENTOS_FOLDER_IDS.');
  }

  return { credenciais, idsPasta };
}

const base64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

async function obterToken(credenciais) {
  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = base64url({ alg: 'RS256', typ: 'JWT' });
  const corpo = base64url({
    iss: credenciais.client_email,
    scope: ESCOPO,
    aud: 'https://oauth2.googleapis.com/token',
    iat: agora,
    exp: agora + 3600,
  });
  const assinatura = crypto.sign(
    'RSA-SHA256', Buffer.from(`${cabecalho}.${corpo}`), credenciais.private_key
  ).toString('base64url');

  const resposta = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${cabecalho}.${corpo}.${assinatura}`,
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!resposta.ok) {
    throw new Error(`Não foi possível autenticar no Google Drive (HTTP ${resposta.status}).`);
  }

  const dados = await resposta.json();
  if (!dados.access_token) throw new Error('Google não retornou token de acesso.');
  return dados.access_token;
}

async function listarPastaDrive(token, idPasta) {
  const arquivos = [];
  let proximaPagina;

  do {
    const params = new URLSearchParams({
      q: `'${idPasta}' in parents and trashed = false`,
      fields: 'nextPageToken,incompleteSearch,files(id,name,mimeType,modifiedTime)',
      pageSize: '1000',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (proximaPagina) params.set('pageToken', proximaPagina);

    const resposta = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!resposta.ok) {
      throw new Error(`Falha ao listar pasta do Drive (HTTP ${resposta.status}). Confira acesso da service account.`);
    }

    const corpo = await resposta.json();
    if (corpo.incompleteSearch) {
      throw new Error('Busca incompleta no Drive. Não use estes resultados.');
    }
    arquivos.push(...(corpo.files ?? []));
    proximaPagina = corpo.nextPageToken;
  } while (proximaPagina);

  return arquivos;
}

async function principal() {
  const { credenciais, idsPasta } = validarConfiguracao();
  const banco = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const [resEmp, resDocs] = await Promise.all([
    banco.from('empreendimentos')
      .select('id,nome,book_url,tabela_url'),
    banco.from('empreendimento_documentos')
      .select('id,empreendimento_id,drive_file_id,tipo,fase,fonte_atualizada_em'),
  ]);

  if (resEmp.error) throw new Error(`Supabase/empreendimentos: ${resEmp.error.message}`);
  if (resDocs.error) throw new Error(`Supabase/documentos: ${resDocs.error.message}`);

  const token = await obterToken(credenciais);
  const encontrados = [];
  for (const id of idsPasta) {
    const arquivos = await listarPastaDrive(token, id);
    encontrados.push(...arquivos);
    console.log(`Pasta ${id.slice(0, 6)}…: ${arquivos.length} itens consultados.`);
  }

  const arquivosUnicos = [...new Map(encontrados.map((item) => [item.id, item])).values()];
  const resultado = compararDocumentosDrive({
    arquivos: arquivosUnicos,
    empreendimentos: resEmp.data ?? [],
    documentos: resDocs.data ?? [],
  });

  console.table(resultado);
  const revisar = resultado.filter((item) =>
    item.situacao.startsWith('REVISAR') ||
    item.situacao === 'CANDIDATO_SEM_VINCULO' ||
    item.situacao === 'SEM_DATA_REFERENCIA'
  );

  console.log(`PDFs encontrados: ${resultado.length}; itens para revisão: ${revisar.length}.`);
  console.log('MODO LEITURA: nada foi modificado. Não há aprovação ou publicação automática.');
}

principal().catch((erro) => {
  console.error(`ERRO: ${erro.message}`);
  process.exitCode = 1;
});

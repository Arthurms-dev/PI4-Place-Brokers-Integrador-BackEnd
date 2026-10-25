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
const { listarArvoreDrive, formatarProgressoDrive } = require('./drive-arvore.cjs');

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

async function principal() {
  const { credenciais, idsPasta } = validarConfiguracao();
  console.log('[1/3] Consultando catálogo e documentos no Supabase (limite de 20s por consulta)...');
  const banco = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: (url, opcoes = {}) => fetch(url, { ...opcoes, signal: AbortSignal.timeout(20000) }) } }
  );

  const [resEmp, resDocs] = await Promise.all([
    banco.from('empreendimentos')
      .select('id,nome,book_url,tabela_url'),
    banco.from('empreendimento_documentos')
      .select('id,empreendimento_id,drive_file_id,tipo,fase,fonte_atualizada_em'),
  ]);

  if (resEmp.error) throw new Error(`Supabase/empreendimentos: ${resEmp.error.message}`);
  if (resDocs.error) throw new Error(`Supabase/documentos: ${resDocs.error.message}`);

  console.log('[2/3] Autenticando a conta de serviço no Google...');
  const token = await obterToken(credenciais);
  console.log('[3/3] Percorrendo pastas e atalhos do Drive...');
  const varredura = await listarArvoreDrive({ pastas: idsPasta, token,
    timeoutMs: Number(process.env.GOOGLE_DRIVE_TIMEOUT_MS || 600000),
    onProgresso: (info) => console.log(formatarProgressoDrive(info)),
  });
  console.table(varredura.resumo);
  for (const aviso of varredura.avisos) {
    console.warn(`REVISAR ${aviso.codigo}: ${aviso.caminho.join(' / ')} — ${aviso.mensagem}`);
  }
  if (!varredura.completo) {
    console.warn('LEITURA INCOMPLETA: os itens abaixo representam somente a parte acessível do acervo.');
    process.exitCode = 2;
  }
  const resultado = compararDocumentosDrive({
    arquivos: varredura.arquivos,
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

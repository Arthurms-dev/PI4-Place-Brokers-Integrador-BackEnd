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
const { listarArvoreDrive, exigirVarreduraCompleta, formatarProgressoDrive } = require('./drive-arvore.cjs');

const args = process.argv.slice(2);
const modoRelatorio = args.length === 2 && args[0] === '--relatorio' &&
  !args[1].startsWith('--') && path.extname(args[1]).toLowerCase() === '.json';
if (!(args.length === 0 || (args.length === 1 && args[0] === '--apply') || modoRelatorio)) {
  console.error('Uso: node scripts/registrar-pendencias-drive.cjs [--apply | --relatorio caminho.json]');
  process.exit(2);
}
const aplicar = args.includes('--apply');
const destinoRelatorio = modoRelatorio ? path.resolve(args[1]) : null;

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

async function executar() {
  const { credenciais, pastas } = configuracao();
  console.log('[1/3] Consultando catálogo e documentos no Supabase (limite de 20s por consulta)...');
  const banco = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: (url, opcoes = {}) => fetch(url, { ...opcoes, signal: AbortSignal.timeout(20000) }) } });

  const [emp, docs] = await Promise.all([
    banco.from('empreendimentos').select('id,nome,book_url,tabela_url'),
    banco.from('empreendimento_documentos')
      .select('id,empreendimento_id,drive_file_id,tipo,fase,status,fonte_atualizada_em'),
  ]);
  if (emp.error) throw new Error(`Supabase/empreendimentos: ${emp.error.message}`);
  if (docs.error) throw new Error(`Supabase/documentos: ${docs.error.message}`);

  console.log('[2/3] Autenticando a conta de serviço no Google...');
  const token = await tokenDrive(credenciais);
  console.log('[3/3] Percorrendo pastas e atalhos do Drive...');
  const varredura = await listarArvoreDrive({ pastas, token,
    timeoutMs: Number(process.env.GOOGLE_DRIVE_TIMEOUT_MS || 600000),
    onProgresso: (info) => console.log(formatarProgressoDrive(info)),
  });
  console.table(varredura.resumo);
  for (const aviso of varredura.avisos) {
    console.warn(`REVISAR ${aviso.codigo}: ${aviso.caminho.join(' / ')} — ${aviso.mensagem}`);
  }
  if (!varredura.completo) {
    console.warn('LEITURA INCOMPLETA: esta simulação não representa todo o acervo.');
  }
  const { pendencias, avisos } = prepararPendencias({
    arquivos: varredura.arquivos, documentos: docs.data ?? [], empreendimentos: emp.data ?? [],
  });

  if (destinoRelatorio) {
    // Exportação local em simulação. Lista explícita: nunca serializar ambiente,
    // credenciais, tokens, cabeçalhos ou resource keys.
    const contar = (itens, campo) => itens.reduce((total, item) => {
      const valor = item[campo] || 'nao_informado';
      total[valor] = (total[valor] || 0) + 1;
      return total;
    }, Object.create(null));
    const relatorio = {
      versao: 1,
      gerado_em: new Date().toISOString(),
      modo: 'simulacao',
      completo: varredura.completo,
      resumo: varredura.resumo,
      catalogo_consultado: {
        empreendimentos: (emp.data ?? []).length,
        documentos: (docs.data ?? []).length,
      },
      motivos_pendencias: contar(pendencias, 'motivo'),
      tipos_de_arquivo: contar(varredura.arquivos, 'mimeType'),
      arquivos: varredura.arquivos.map((a) => ({
        id: a.id, nome: a.name, mime_type: a.mimeType,
        modificado_em: a.modifiedTime, pasta_id: a.pastaId,
        caminho: a.caminho ?? [],
        link: `https://drive.google.com/file/d/${a.id}/view`,
      })),
      pendencias,
      avisos_drive: varredura.avisos.map((a) => ({
        codigo: a.codigo, id: a.id, arquivo: a.arquivo,
        caminho: a.caminho, mensagem: a.mensagem,
      })),
      avisos_documentos: avisos.map((a) => ({ arquivo: a.arquivo, motivo: a.motivo })),
    };
    // Não sobrescrever arquivos existentes, inclusive um relatório anterior.
    fs.writeFileSync(destinoRelatorio, JSON.stringify(relatorio, null, 2) + '\n',
      { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    console.log(`Relatório JSON salvo: ${destinoRelatorio}`);
  }

  console.table(pendencias.map((p) => ({
    arquivo: p.arquivo_nome, motivo: p.motivo, tipo: p.tipo ?? 'A DEFINIR',
    fase: p.fase ?? 'A DEFINIR', documento: p.documento_id ? 'JÁ VINCULADO' : 'SEM VÍNCULO SEGURO',
  })));
  for (const aviso of avisos) console.warn(`REVISAR: ${aviso.arquivo}: ${aviso.motivo}`);
  console.log(`Pendências identificadas: ${pendencias.length}. Avisos de metadados: ${avisos.length}.`);

  if (!aplicar) {
    if (!varredura.completo) process.exitCode = 2;
    console.log('MODO SIMULAÇÃO: nenhuma alteração no banco.');
    if (pendencias.length > 100) {
      console.log('Mais de 100 pendências: --apply está bloqueado. Revise o acervo e os vínculos antes de gravar.');
    } else {
      console.log('Para registrar pendências, use --apply após revisar a lista.');
    }
    return;
  }

  exigirVarreduraCompleta(varredura);

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

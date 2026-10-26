#!/usr/bin/env node
'use strict';
/**
 * Baixa as fotos que as construtoras deixam em pastas de imagens no Google Drive,
 * converte para WebP (até 1600 px) e acrescenta ao manifesto da curadoria.
 * Depois é só rodar o importar-midias-catalogo.cjs normalmente.
 *
 * Lê:  %USERPROFILE%\Desktop\catalogo-place\fontes-drive.json
 * Grava: catalogo-place\<slug>\capa-*.webp, NN-*.webp e atualiza manifesto.json
 *
 * USO (na pasta placebrokers-api):
 *   node scripts/baixar-fotos-drive.cjs
 *   node scripts/baixar-fotos-drive.cjs --so parc-college,belem-boulevard
 *
 * Os arquivos são baixados pelo link público do Drive. Se algum não estiver público,
 * o script tenta com a conta de serviço (GOOGLE_APPLICATION_CREDENTIALS no .env);
 * nesse caso compartilhe a pasta com o e-mail da conta de serviço como Leitor.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
require('dotenv').config();
const sharp = require('sharp');

const args = process.argv.slice(2);
const valor = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const pasta = path.resolve(valor('--pasta') ?? path.join(os.homedir(), 'Desktop', 'catalogo-place'));
const somente = valor('--so')?.split(',').map((s) => s.trim()).filter(Boolean);
const LADO_MAXIMO = 1600;

const ACENTOS = {
  espaco: 'espaço', salao: 'salão', area: 'área', redario: 'redário', bicicletario: 'bicicletário',
  calcada: 'calçada', edificio: 'edifício', suite: 'suíte', poliesportiva: 'poliesportiva',
};
const legenda = (s) => s.split('-').map((p) => ACENTOS[p] ?? p).join(' ');

let tokenServico;
async function tokenDaContaDeServico() {
  if (tokenServico) return tokenServico;
  const caminho = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!caminho) throw new Error('arquivo não é público e GOOGLE_APPLICATION_CREDENTIALS não está no .env');
  const cred = JSON.parse(fs.readFileSync(path.resolve(caminho), 'utf8'));
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const agora = Math.floor(Date.now() / 1000);
  const cabeca = b64({ alg: 'RS256', typ: 'JWT' });
  const corpo = b64({
    iss: cred.client_email, scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat: agora, exp: agora + 3600,
  });
  const assinatura = crypto.sign('RSA-SHA256', Buffer.from(`${cabeca}.${corpo}`), cred.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${cabeca}.${corpo}.${assinatura}` }),
  });
  if (!r.ok) throw new Error(`autenticação da conta de serviço falhou (HTTP ${r.status})`);
  tokenServico = (await r.json()).access_token;
  return tokenServico;
}

async function baixar(id) {
  const publicos = [
    `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${id}`,
  ];
  for (const url of publicos) {
    try {
      const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60000) });
      const tipo = r.headers.get('content-type') ?? '';
      if (r.ok && tipo.startsWith('image/')) return Buffer.from(await r.arrayBuffer());
    } catch { /* tenta o próximo */ }
  }
  const token = await tokenDaContaDeServico();
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

function extrairPacotes() {
  // As fotos curadas chegam em novos-parte*.zip: extrai na própria pasta (tar vem no Windows 10+).
  for (const zip of fs.readdirSync(pasta).filter((f) => /^novos-parte\d+\.zip$/i.test(f)).sort()) {
    console.log(`Extraindo ${zip}...`);
    execFileSync('tar', ['-xf', path.join(pasta, zip), '-C', pasta], { stdio: 'inherit' });
    fs.renameSync(path.join(pasta, zip), path.join(pasta, `${zip}.extraido`));
  }
}

(async () => {
  if (!fs.existsSync(pasta)) throw new Error(`pasta não encontrada: ${pasta}`);
  extrairPacotes();
  const arqFontes = path.join(pasta, 'fontes-drive.json');
  const arqManifesto = path.join(pasta, 'manifesto.json');
  if (!fs.existsSync(arqFontes) || !fs.existsSync(arqManifesto)) {
    throw new Error(`fontes-drive.json ou manifesto.json não encontrados em ${pasta}`);
  }
  const fontes = JSON.parse(fs.readFileSync(arqFontes, 'utf8'));
  const manifesto = JSON.parse(fs.readFileSync(arqManifesto, 'utf8'));

  for (const [slug, fonte] of Object.entries(fontes)) {
    if (slug.startsWith('_') || (somente && !somente.includes(slug))) continue;
    const destino = path.join(pasta, slug);
    fs.mkdirSync(destino, { recursive: true });
    const galeria = [];
    let capa = null;
    console.log(`${fonte.nome}: ${fonte.arquivos.length} fotos`);

    for (const [i, [nome, id]] of fonte.arquivos.entries()) {
      const arquivo = i === 0 ? `capa-${nome}.webp` : `${String(i).padStart(2, '0')}-${nome}.webp`;
      const saida = path.join(destino, arquivo);
      try {
        if (!fs.existsSync(saida)) {
          const original = await baixar(id);
          await sharp(original).rotate()
            .resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 82 }).toFile(saida);
        }
        const item = { arquivo, alt: `${fonte.nome} — ${legenda(nome)} (imagem ilustrativa)` };
        if (i === 0) capa = item; else galeria.push(item);
        console.log(`   ok ${arquivo}`);
      } catch (e) {
        console.log(`   FALHOU ${nome}: ${e.message}`);
      }
    }

    if (capa || galeria.length) {
      manifesto.empreendimentos[slug] = { nome: fonte.nome, capa, galeria: galeria.slice(0, 20), publicar: true };
    }
  }

  fs.writeFileSync(arqManifesto, JSON.stringify(manifesto, null, 1));
  console.log('\nManifesto atualizado. Agora rode: node scripts/importar-midias-catalogo.cjs --apply --publicar');
})().catch((e) => {
  console.error(`ERRO: ${e.message}`);
  process.exitCode = 1;
});

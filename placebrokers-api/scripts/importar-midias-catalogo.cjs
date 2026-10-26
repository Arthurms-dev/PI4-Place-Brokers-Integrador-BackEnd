#!/usr/bin/env node
'use strict';
/**
 * Importa a curadoria de imagens do catálogo (capa + galeria) para o Supabase.
 *
 * Lê a pasta gerada na curadoria (padrão: %USERPROFILE%\Desktop\catalogo-place),
 * com um manifesto.json e uma subpasta por empreendimento contendo arquivos .webp.
 *
 * Para cada empreendimento do manifesto:
 *  1. envia os .webp para o bucket "empreendimentos" em catalogo/<versao>/<slug>/
 *  2. troca a capa (quando o manifesto tiver capa)
 *  3. substitui a galeria (empreendimento_imagens) pela nova lista, na ordem do manifesto
 *
 * Os arquivos antigos NÃO são apagados do Storage (dá para voltar atrás pelo backup
 * impresso no início da execução).
 *
 * USO (na pasta placebrokers-api):
 *   node scripts/importar-midias-catalogo.cjs            -> simulação, não altera nada
 *   node scripts/importar-midias-catalogo.cjs --apply    -> aplica
 *   node scripts/importar-midias-catalogo.cjs --pasta "C:\caminho\catalogo-place" --apply
 *   node scripts/importar-midias-catalogo.cjs --so viva-paineiras,brisa-do-mar --apply
 *   node scripts/importar-midias-catalogo.cjs --apply --publicar   -> também publica no site
 *                                  os empreendimentos marcados com "publicar": true no manifesto
 *
 * Requer SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env local do back-end.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const args = process.argv.slice(2);
const aplicar = args.includes('--apply');
const publicar = args.includes('--publicar');
const valor = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const pasta = path.resolve(valor('--pasta') ?? path.join(os.homedir(), 'Desktop', 'catalogo-place'));
const somente = valor('--so')?.split(',').map((s) => s.trim()).filter(Boolean);

const BUCKET = 'empreendimentos';
const LIMITE_GALERIA = 20;
const norm = (s) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function falhar(msg) {
  console.error(`ERRO: ${msg}`);
  process.exit(1);
}

(async () => {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) falhar('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env do back-end.');
  const arqManifesto = path.join(pasta, 'manifesto.json');
  if (!fs.existsSync(arqManifesto)) falhar(`manifesto.json não encontrado em ${pasta}`);

  const manifesto = JSON.parse(fs.readFileSync(arqManifesto, 'utf8'));
  const prefixo = manifesto.pasta_storage;
  if (!/^catalogo\/\d{4}-\d{2}-\d{2}$/.test(prefixo ?? '')) falhar('pasta_storage inválida no manifesto.');

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linhas, error } = await db
    .from('empreendimentos')
    .select('id, nome, publicado, capa_url, imagens:empreendimento_imagens(id, url, alt, ordem)');
  if (error) falhar(error.message);

  const entradas = Object.entries(manifesto.empreendimentos).filter(([slug]) => !somente || somente.includes(slug));
  console.log(`Modo: ${aplicar ? 'APLICAR' : 'SIMULAÇÃO (nada será alterado)'} | pasta: ${pasta}\n`);

  // Valida tudo antes de mexer em qualquer coisa.
  const plano = [];
  for (const [slug, item] of entradas) {
    const alvo = linhas.filter((l) => norm(l.nome) === norm(item.nome));
    if (alvo.length !== 1) falhar(`${item.nome}: ${alvo.length} empreendimentos com esse nome no banco (esperado 1).`);
    const arquivos = [...(item.capa ? [item.capa] : []), ...item.galeria];
    for (const a of arquivos) {
      const p = path.join(pasta, slug, a.arquivo);
      if (!fs.existsSync(p)) falhar(`arquivo ausente: ${p}`);
      if (!/\.webp$/i.test(a.arquivo)) falhar(`só .webp é aceito: ${a.arquivo}`);
    }
    if (item.galeria.length > LIMITE_GALERIA) falhar(`${item.nome}: galeria com mais de ${LIMITE_GALERIA} fotos.`);
    plano.push({ slug, item, emp: alvo[0] });
  }

  // Backup do estado atual (para desfazer, se precisar).
  const backup = plano.map(({ emp }) => ({ id: emp.id, nome: emp.nome, capa_url: emp.capa_url, imagens: emp.imagens }));
  const arqBackup = path.join(pasta, `backup-antes-da-importacao-${Date.now()}.json`);
  fs.writeFileSync(arqBackup, JSON.stringify(backup, null, 2));
  console.log(`Backup do estado atual salvo em ${arqBackup}\n`);

  async function publicarEmpreendimento(emp) {
    const { error: ePub } = await db.from('empreendimentos').update({ publicado: true }).eq('id', emp.id);
    if (ePub) throw new Error(`${emp.nome} (publicar): ${ePub.message}`);
    console.log('   publicado no site');
  }

  for (const { slug, item, emp } of plano) {
    const antes = `${emp.imagens?.length ?? 0} fotos`;
    const jaImportado = (emp.imagens ?? []).length === item.galeria.length
      && (emp.imagens ?? []).every((im) => im.url.includes(`/${prefixo}/${slug}/`));
    const publicarEste = publicar && item.publicar === true && !emp.publicado;
    if (jaImportado) {
      console.log(`${emp.nome}: já importado nesta versão${publicarEste ? ' (só falta publicar)' : ', pulando.'}`);
      if (aplicar && publicarEste) await publicarEmpreendimento(emp);
      continue;
    }
    console.log(`${emp.nome}: capa ${item.capa ? 'NOVA' : 'mantida'} | galeria ${antes} -> ${item.galeria.length} fotos${publicarEste ? ' | será publicado' : ''}`);
    if (!aplicar) continue;

    const subir = async (a) => {
      const buffer = fs.readFileSync(path.join(pasta, slug, a.arquivo));
      const destino = `${prefixo}/${slug}/${a.arquivo}`;
      // A conexão às vezes cai no meio do envio: tenta de novo antes de desistir.
      for (let tentativa = 1; ; tentativa++) {
        const { error: e } = await db.storage.from(BUCKET).upload(destino, buffer, {
          contentType: 'image/webp', upsert: true, cacheControl: '31536000',
        });
        if (!e) break;
        const detalhe = [e.message, e.statusCode, e.originalError?.message ?? e.cause?.message].filter(Boolean).join(' | ') || 'falha de rede';
        if (tentativa >= 4) throw new Error(`${destino}: ${detalhe}`);
        console.log(`   tentativa ${tentativa} falhou (${detalhe}), tentando de novo...`);
        await new Promise((r) => setTimeout(r, 1500 * tentativa));
      }
      return db.storage.from(BUCKET).getPublicUrl(destino).data.publicUrl;
    };

    const novas = [];
    for (const [i, a] of item.galeria.entries()) novas.push({ empreendimento_id: emp.id, url: await subir(a), alt: a.alt, ordem: i + 1 });
    const capaUrl = item.capa ? await subir(item.capa) : null;

    // Só troca no banco depois que todos os uploads deram certo.
    const { error: eIns } = await db.from('empreendimento_imagens').insert(novas);
    if (eIns) throw new Error(`${emp.nome} (inserir galeria): ${eIns.message}`);
    const antigas = (emp.imagens ?? []).map((im) => im.id);
    if (antigas.length) {
      const { error: eDel } = await db.from('empreendimento_imagens').delete().in('id', antigas);
      if (eDel) throw new Error(`${emp.nome} (remover galeria antiga): ${eDel.message}`);
    }
    if (capaUrl) {
      const { error: eCapa } = await db.from('empreendimentos').update({ capa_url: capaUrl }).eq('id', emp.id);
      if (eCapa) throw new Error(`${emp.nome} (capa): ${eCapa.message}`);
    }
    if (publicarEste) await publicarEmpreendimento(emp);
    console.log('   ok');
  }

  console.log(aplicar ? '\nConcluído.' : '\nSimulação concluída. Rode de novo com --apply para aplicar.');
})().catch((e) => {
  console.error(`ERRO: ${e.message}`);
  process.exitCode = 1;
});

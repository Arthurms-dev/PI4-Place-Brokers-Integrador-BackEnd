#!/usr/bin/env node
'use strict';

// Gera a miniatura (640 px) das capas que ainda não têm, para os cards do site carregarem rápido.
// Capas novas já ganham miniatura no upload; este script cuida das antigas.
//
// Uso (na pasta placebrokers-api, com o .env preenchido):
//   node scripts/gerar-miniaturas.cjs --simular   # só mostra o que faria
//   node scripts/gerar-miniaturas.cjs             # gera e grava
// Pode rodar de novo quando quiser: só mexe em quem está sem miniatura.

require('dotenv').config();
const { randomUUID } = require('node:crypto');
const { supabaseAdmin } = require('../src/config/supabase');
const { gerarMiniatura, BUCKET_IMAGENS } = require('../src/services/uploadService');

const simular = process.argv.includes('--simular');

async function main() {
  const { data, error } = await supabaseAdmin
    .from('empreendimentos')
    .select('id, nome, capa_url')
    .not('capa_url', 'is', null)
    .is('capa_miniatura_url', null)
    .order('nome');
  if (error) throw error;

  console.log(`${data.length} capa(s) sem miniatura.${simular ? ' (simulação: nada será gravado)' : ''}`);
  let feitas = 0;
  for (const emp of data) {
    try {
      const resposta = await fetch(emp.capa_url);
      if (!resposta.ok) throw new Error(`capa respondeu ${resposta.status}`);
      const original = Buffer.from(await resposta.arrayBuffer());
      const mini = await gerarMiniatura(original);
      if (simular) {
        console.log(`- ${emp.nome}: ${Math.round(original.length / 1024)} KB → ${Math.round(mini.length / 1024)} KB`);
        continue;
      }
      const caminho = `${emp.id}/miniaturas/${randomUUID()}.webp`;
      const { error: erroUpload } = await supabaseAdmin.storage.from(BUCKET_IMAGENS)
        .upload(caminho, mini, { upsert: false, contentType: 'image/webp', cacheControl: '31536000' });
      if (erroUpload) throw erroUpload;
      const { data: publico } = supabaseAdmin.storage.from(BUCKET_IMAGENS).getPublicUrl(caminho);
      const { error: erroUpdate } = await supabaseAdmin.from('empreendimentos')
        .update({ capa_miniatura_url: publico.publicUrl }).eq('id', emp.id);
      if (erroUpdate) throw erroUpdate;
      feitas += 1;
      console.log(`✓ ${emp.nome}: ${Math.round(original.length / 1024)} KB → ${Math.round(mini.length / 1024)} KB`);
    } catch (err) {
      console.error(`✗ ${emp.nome}: ${err?.message ?? err}`);
    }
  }
  if (!simular) console.log(`Pronto: ${feitas} miniatura(s) gravada(s).`);
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exitCode = 1;
});

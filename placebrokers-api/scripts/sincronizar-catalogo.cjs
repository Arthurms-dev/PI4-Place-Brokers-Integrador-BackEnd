#!/usr/bin/env node
'use strict';
/**
 * Primeira rodada: vincular somente book e tabela de imóveis já cadastrados,
 * sem duplicar, publicar, alterar disponibilidade ou preços.
 * USO (da raiz placebrokers-api): node scripts/sincronizar-catalogo.cjs
 * Para aplicar após revisão: node scripts/sincronizar-catalogo.cjs --apply
 */
const path=require('path');
require(path.join(process.cwd(),'node_modules/dotenv')).config();
const {createClient}=require(path.join(process.cwd(),'node_modules/@supabase/supabase-js'));
const itens=require(path.join(__dirname,'catalogo-drive-lote1.json'));
const aplicar=process.argv.includes('--apply');
const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const URL=process.env.SUPABASE_URL, KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!URL||!KEY){console.error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY somente no .env local do back-end.');process.exit(1)}
const client=createClient(URL,KEY,{auth:{autoRefreshToken:false,persistSession:false}});
(async()=>{
  const {data:rows,error}=await client.from('empreendimentos').select('id,nome,book_url,tabela_url');
  if(error) throw error;
  let preparados=0,aplicados=0;
  for(const i of itens){
    const candidatos=rows.filter(r=>norm(r.nome)===norm(i.nome));
    if(candidatos.length!==1){console.log(`REVISAR: ${i.nome} -> ${candidatos.length} correspondências exatas (não atualizado)`);continue;}
    const atual=candidatos[0];
    // Preencher apenas campos vazios. Links existentes exigem revisão humana.
    const updates={};
    if(!atual.book_url && i.book_url) updates.book_url=i.book_url;
    else if(atual.book_url&&atual.book_url!==i.book_url) console.log(`REVISAR: ${i.nome} já tem book`);
    if(!atual.tabela_url && i.tabela_url) updates.tabela_url=i.tabela_url;
    else if(atual.tabela_url&&atual.tabela_url!==i.tabela_url) console.log(`REVISAR: ${i.nome} já tem tabela`);
    if(!Object.keys(updates).length){console.log(`SEM MUDANÇA: ${i.nome}`);continue;}
    console.log(`${aplicar?'APLICAR':'SIMULAR'} ${i.nome}: ${Object.keys(updates).join(', ')}`);
    preparados++;
    if(aplicar){const {error:e}=await client.from('empreendimentos').update(updates).eq('id',atual.id);
      if(e){console.error('ERRO:',i.nome,e.message);continue;} aplicados++;}
  }
  console.log(`Total preparado: ${preparados}; efetivado: ${aplicados}; modo: ${aplicar?'APLICAÇÃO':'SIMULAÇÃO'}`);
  if(!aplicar) console.log('Sem alterações. Confirme os dados e permissões do Drive antes de usar --apply.');
})().catch(e=>{console.error(e.message);process.exitCode=1});

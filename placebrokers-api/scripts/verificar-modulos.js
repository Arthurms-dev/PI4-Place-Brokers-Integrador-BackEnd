// placebrokers-api/scripts/verificar-modulos.js
// Procura todos os require('./...') do back e avisa o que está FALTANDO e o que tem
// maiúscula/minúscula errada (no Windows funciona, mas quebra no Linux, por exemplo na hospedagem).
//
//   cd placebrokers-api
//   node scripts/verificar-modulos.js

const fs = require('fs');
const path = require('path');

const SRC = path.join(process.cwd(), 'src');
const arquivos = [];
(function varrer(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) varrer(p);
    else if (e.name.endsWith('.js')) arquivos.push(p);
  }
})(SRC);

/** Confere, pasta por pasta, se o nome bate exatamente (com maiúsculas). Devolve o nome real ou null. */
function nomeReal(caminho) {
  const partes = path.relative(SRC, caminho).split(path.sep);
  let atual = SRC;
  for (const parte of partes) {
    const nomes = fs.readdirSync(atual);
    const achou = nomes.find((n) => n === parte) ?? nomes.find((n) => n.toLowerCase() === parte.toLowerCase());
    if (!achou) return null;
    atual = path.join(atual, achou);
  }
  return path.relative(SRC, atual);
}

const faltando = new Map();
const maiuscula = new Map();
for (const arq of arquivos) {
  const texto = fs.readFileSync(arq, 'utf8');
  for (const m of texto.matchAll(/require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) {
    const base = path.resolve(path.dirname(arq), m[1]);
    const candidatos = [base, `${base}.js`, `${base}.json`, path.join(base, 'index.js')];
    const existente = candidatos.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
    const quem = path.relative(SRC, arq);
    if (!existente) {
      const esperado = path.relative(SRC, `${base}.js`);
      faltando.set(esperado, [...(faltando.get(esperado) ?? []), quem]);
      continue;
    }
    const real = nomeReal(existente);
    const pedido = path.relative(SRC, existente);
    if (real && real !== pedido) maiuscula.set(pedido, { real, quem });
  }
}

if (faltando.size === 0 && maiuscula.size === 0) {
  console.log('Tudo certo: todos os módulos existem e os nomes batem.');
  process.exit(0);
}
if (faltando.size) {
  console.log('FALTANDO (copie estes arquivos):');
  for (const [arq, quem] of faltando) console.log(`  src/${arq.split(path.sep).join('/')}   <- pedido por ${[...new Set(quem)].join(', ')}`);
}
if (maiuscula.size) {
  console.log('\nNOME COM MAIÚSCULA/MINÚSCULA DIFERENTE (renomeie com "git mv"):');
  for (const [pedido, { real, quem }] of maiuscula) console.log(`  o código pede ${pedido}, mas o arquivo é ${real}   (em ${quem})`);
}
process.exit(1);

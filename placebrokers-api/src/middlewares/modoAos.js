'use strict';

// Modo da apresentação de AOS: com EXIGIR_LOGIN_EM_TUDO=1 (só na cópia da Vercel),
// toda rota pede login, menos as de entrar e se cadastrar (e as que fazem parte do login:
// renovar a sessão e recuperar a senha). /health e /docs não devolvem dados.
// O Render (site no ar) continua sem essa variável: o catálogo e o formulário do site são públicos.
const LIBERADAS = new Set([
  'POST /auth/login',
  'POST /auth/register',
  'POST /auth/renovar',
  'POST /auth/esqueci-senha',
  'POST /auth/redefinir-senha',
  'GET /health',
]);

function modoAosLigado(env = process.env) {
  return env.EXIGIR_LOGIN_EM_TUDO === '1';
}

function rotaLiberada(req) {
  if (req.method === 'OPTIONS') return true;
  const caminho = (req.path || '/').replace(/\/+$/, '') || '/';
  if (caminho === '/docs' || caminho.startsWith('/docs/')) return true;
  return LIBERADAS.has(`${req.method} ${caminho}`);
}

function exigirLoginEmTudo(auth = require('./authMiddleware').authMiddleware) {
  return (req, res, next) => (rotaLiberada(req) ? next() : auth(req, res, next));
}

module.exports = { exigirLoginEmTudo, modoAosLigado, rotaLiberada, LIBERADAS };

'use strict';

// Entrada da API na Vercel (segunda via, para a apresentação de AOS).
// A versão principal continua no Render (src/server.js). Aqui não há app.listen:
// a Vercel chama o Express a cada requisição.
// Diferenças da Vercel: sem processo contínuo, então o aviso de lead novo
// (e-mail e push, que roda a cada 30 s) fica só no Render; uploads acima de ~4,5 MB não passam.

require('dotenv').config();

const Sentry = require('@sentry/node');
Sentry.init({
  dsn: process.env.SENTRY_DSN_API,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});

module.exports = require('../src/app');

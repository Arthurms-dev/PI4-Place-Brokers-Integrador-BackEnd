'use strict';

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection (detalhe):', reason);
});

require('dotenv').config();

const Sentry = require('@sentry/node');
Sentry.init({
  dsn: process.env.SENTRY_DSN_API,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});

const app = require('./app');

const PORT = process.env.PORT || 3333;

app.listen(PORT, () => {
  console.log(`placebrokers-api rodando em http://localhost:${PORT}`);
  // Aviso de lead novo no celular do corretor (só liga se as chaves VAPID estiverem configuradas).
  require('./services/notificacaoService').notificacoes().iniciar();
});
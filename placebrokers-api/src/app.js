'use strict';

const express = require('express');
const { aplicarSeguranca, aplicarErros } = require('./middlewares/seguranca');
const authRoutes = require('./routes/authRoutes');
const empreendimentoRoutes = require('./routes/empreendimentoRoutes');
const construtoraRoutes = require('./routes/construtoraRoutes');
const painelRoutes = require('./routes/painelAdmRoutes');
const leadRoutes = require('./routes/leadRoutes');
const equipeRoutes = require('./routes/equiperoutes');
const vendaRoutes = require('./routes/vendaRoutes');
const corretorRoutes = require('./routes/corretorRoutes');
const metricasRoutes = require('./routes/metricasroutes');
const agendamentoRoutes = require('./routes/agendamentoRoutes');
const clienteRoutes = require('./routes/clienteroutes');
const gerenteRoutes = require('./routes/gerenteroutes');
const viabilizadorRoutes = require('./routes/viabilizadorroutes');
const roletaRoutes = require('./routes/roletaRoutes');
const notificacaoRoutes = require('./routes/notificacaoRoutes');

const app = express();

aplicarSeguranca(app);

app.use('/auth', authRoutes);
app.use('/leads', leadRoutes);
app.use('/corretores', corretorRoutes);
app.use('/empreendimentos', empreendimentoRoutes);
app.use('/construtoras', construtoraRoutes);
app.use('/painel', painelRoutes);
app.use('/equipe', equipeRoutes);
app.use('/vendas', vendaRoutes);
app.use('/metricas', metricasRoutes);
app.use('/agendamentos', agendamentoRoutes);
app.use('/clientes', clienteRoutes);
app.use('/gerente', gerenteRoutes);
app.use('/viabilizador', viabilizadorRoutes);
app.use('/roleta', roletaRoutes);
app.use('/notificacoes', notificacaoRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

aplicarErros(app);

module.exports = app;

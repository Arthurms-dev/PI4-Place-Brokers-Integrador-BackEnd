'use strict';

const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const empreendimentoRoutes = require('./routes/empreendimentoRoutes');
const construtoraRoutes = require('./routes/construtoraRoutes');
const painelRoutes = require('./routes/painelAdmRoutes');
const leadRoutes = require('./routes/leadRoutes');
const equipeRoutes = require('./routes/equipeRoutes');
const vendaRoutes = require('./routes/vendaRoutes');
const corretorRoutes = require('./routes/corretorRoutes');
const metricasRoutes = require('./routes/metricasroutes');
const agendamentoRoutes = require('./routes/agendamentoRoutes');

const app = express();

app.use(cors());
app.use(express.json());

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

app.get('/health', (req, res) => res.json({ status: 'ok' }));

module.exports = app;
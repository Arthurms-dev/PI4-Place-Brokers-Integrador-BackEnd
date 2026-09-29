'use strict';

const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const empreendimentoRoutes = require('./routes/empreendimentoRoutes');
const construtoraRoutes = require('./routes/construtoraRoutes');
const painelRoutes = require('./routes/painelAdmRoutes');
const leadRoutes = require('./routes/leadRoutes');
const equipeRoutes = require('./routes/equiperoutes');
const vendaRoutes = require('./routes/vendaroutes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/empreendimentos', empreendimentoRoutes);
app.use('/construtoras', construtoraRoutes);
app.use('/painel', painelRoutes);
app.use('/leads', leadRoutes);
app.use('/equipe', equipeRoutes);
app.use('/vendas', vendaRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

module.exports = app;
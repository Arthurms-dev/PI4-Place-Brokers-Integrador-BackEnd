'use strict';

const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const empreendimentoRoutes = require('./routes/empreendimentoRoutes');
const construtoraRoutes = require('./routes/construtoraRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/empreendimentos', empreendimentoRoutes);
app.use('/construtoras', construtoraRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

module.exports = app;
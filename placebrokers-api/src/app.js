'use strict';

const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/auth', authRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

module.exports = app;
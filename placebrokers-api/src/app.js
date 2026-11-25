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
const diretorRoutes = require('./routes/diretorRoutes');
const roletaRoutes = require('./routes/roletaRoutes');
const notificacaoRoutes = require('./routes/notificacaoRoutes');
const trabalheConoscoRoutes = require('./routes/trabalheConoscoRoutes');
const rhRoutes = require('./routes/rhRoutes');
const { montarDocs } = require('./docs/openapi');
const { exigirLoginEmTudo, modoAosLigado } = require('./middlewares/modoAos');

const app = express();

aplicarSeguranca(app);
if (modoAosLigado()) app.use(exigirLoginEmTudo());

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
app.use('/diretor', diretorRoutes);
app.use('/roleta', roletaRoutes);
app.use('/notificacoes', notificacaoRoutes);
app.use('/trabalhe-conosco', trabalheConoscoRoutes);
app.use('/rh', rhRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Documentação da API: /docs (Swagger UI) e /docs/openapi.json
montarDocs(app);

aplicarErros(app);

module.exports = app;

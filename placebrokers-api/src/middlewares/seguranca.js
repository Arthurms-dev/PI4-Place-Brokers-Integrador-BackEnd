'use strict';

const MINUTO = 60 * 1000;

function criarLimitador({
  janelaMs,
  maximo,
  chave = (req) => req.ip,
  mensagem = 'Muitas tentativas. Aguarde um pouco e tente de novo.',
  contarSomenteFalhas = false,
  agora = Date.now,
}) {
  const registros = new Map();
  const faxina = setInterval(() => {
    const t = agora();
    for (const [k, r] of registros) if (t - r.inicio >= janelaMs) registros.delete(k);
  }, Math.max(janelaMs, MINUTO));
  faxina.unref?.();

  return function limitador(req, res, next) {
    if (process.env.DESLIGAR_LIMITES === 'true') return next();

    const k = String(chave(req) ?? 'desconhecido');
    const t = agora();
    let r = registros.get(k);
    if (!r || t - r.inicio >= janelaMs) {
      r = { inicio: t, total: 0 };
      registros.set(k, r);
    }

    const segundos = Math.max(1, Math.ceil((r.inicio + janelaMs - t) / 1000));
    if (r.total >= maximo) {
      res.setHeader('Retry-After', String(segundos));
      return res.status(429).json({ code: 'TOO_MANY_REQUESTS', message: mensagem });
    }

    if (contarSomenteFalhas) {
      res.on('finish', () => {
        if (res.statusCode >= 400) r.total += 1;
      });
    } else {
      r.total += 1;
    }
    res.setHeader('RateLimit-Limit', String(maximo));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, maximo - r.total)));
    return next();
  };
}

const chaveDoEmail = (req) => `${req.ip}|${String(req.body?.email ?? '').trim().toLowerCase()}`;

const limitadores = {
  global: criarLimitador({ janelaMs: MINUTO, maximo: 600 }),
  loginPorIp: criarLimitador({ janelaMs: 15 * MINUTO, maximo: 30, contarSomenteFalhas: true, mensagem: 'Muitas tentativas de login. Tente de novo em alguns minutos.' }),
  loginPorEmail: criarLimitador({ janelaMs: 15 * MINUTO, maximo: 5, contarSomenteFalhas: true, chave: chaveDoEmail, mensagem: 'Muitas tentativas de login com este e-mail. Tente de novo em 15 minutos.' }),
  cadastro: criarLimitador({ janelaMs: 60 * MINUTO, maximo: 10, mensagem: 'Muitos cadastros a partir desta conexão. Tente de novo mais tarde.' }),
  trocaDeSenha: criarLimitador({ janelaMs: 15 * MINUTO, maximo: 5, contarSomenteFalhas: true, chave: (req) => req.userId ?? req.ip, mensagem: 'Muitas tentativas de trocar a senha. Tente de novo em 15 minutos.' }),
  leadPublico: criarLimitador({ janelaMs: 10 * MINUTO, maximo: 8, mensagem: 'Recebemos muitos envios desta conexão. Aguarde alguns minutos e tente de novo.' }),
  eventos: criarLimitador({ janelaMs: MINUTO, maximo: 120 }),
};

const SEM_CONTROLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const corte = (valor, limite) => (typeof valor === 'string' ? valor.replace(SEM_CONTROLE, '').trim().slice(0, limite) : valor);

function antiSpamLead(req, res, next) {
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const links = String(b.mensagem ?? '').match(/https?:\/\//gi) ?? [];
  if (b.website || links.length > 2) return res.status(201).json({ lead: { recebido: true } });

  req.body = {
    ...b,
    nome: corte(b.nome, 120),
    email: corte(b.email, 160),
    telefone: corte(b.telefone, 20),
    mensagem: corte(b.mensagem, 1000),
  };
  delete req.body.website;
  return next();
}

const ORIGENS_DE_DESENVOLVIMENTO = ['http://localhost:5173', 'http://127.0.0.1:5173'];

function origensPermitidas(env = process.env) {
  const configuradas = (env.CORS_ORIGIN ?? '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  const locais = env.NODE_ENV === 'production' ? [] : ORIGENS_DE_DESENVOLVIMENTO;
  return [...new Set([...configuradas, ...locais])];
}

const origemPermitida = (origin, lista) => !origin || lista.includes(origin);

function cabecalhosDeSeguranca(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  res.setHeader('Cache-Control', 'no-store');
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
}

function aplicarSeguranca(app) {
  const cors = require('cors');
  const express = require('express');

  app.disable('x-powered-by');
  const proxies = Number(process.env.TRUST_PROXY ?? 0);
  if (proxies > 0) app.set('trust proxy', proxies);

  const lista = origensPermitidas();
  console.log(`CORS liberado para: ${lista.join(', ') || '(nenhum site)'}`);
  if (lista.length === 0) console.warn('CORS_ORIGIN não definido em produção: nenhum site conseguirá chamar a API.');
  const avisadas = new Set();

  app.use(cabecalhosDeSeguranca);
  app.use(cors({
    origin: (origin, cb) => {
      const liberada = origemPermitida(origin, lista);
      if (!liberada && !avisadas.has(origin)) {
        avisadas.add(origin);
        console.warn(`CORS bloqueou a origem ${origin}. Para liberar, acrescente em CORS_ORIGIN no .env do back (ou tire NODE_ENV=production no ambiente local).`);
      }
      cb(null, liberada);
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use(limitadores.global);
}

function aplicarErros(app) {
  app.use((req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'Rota não encontrada.' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ code: 'PAYLOAD_TOO_LARGE', message: 'Conteúdo grande demais.' });
    if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ code: 'INVALID_JSON', message: 'O corpo da requisição não é um JSON válido.' });
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ code: 'FILE_TOO_LARGE', message: 'O arquivo passa de 15 MB.' });
    console.error(err);
    return res.status(500).json({ code: 'SERVER_ERROR', message: 'Erro interno do servidor.' });
  });
}

module.exports = {
  criarLimitador,
  limitadores,
  antiSpamLead,
  origensPermitidas,
  origemPermitida,
  cabecalhosDeSeguranca,
  aplicarSeguranca,
  aplicarErros,
};
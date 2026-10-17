'use strict';

const { criarLimitador, antiSpamLead, origensPermitidas, origemPermitida, aplicarErros } = require('./seguranca');

function criarRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    _ouvintes: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(n) { this.statusCode = n; return this; },
    json(o) { this.body = o; return this; },
    on(evento, fn) { this._ouvintes[evento] = fn; },
    terminar(status) { this.statusCode = status; this._ouvintes.finish?.(); },
  };
  return res;
}

const MIN = 60 * 1000;

describe('criarLimitador', () => {
  test('deixa passar até o máximo e bloqueia a tentativa seguinte com 429 e Retry-After', () => {
    const limitador = criarLimitador({ janelaMs: MIN, maximo: 3, chave: () => 'a' });
    const next = jest.fn();

    for (let i = 0; i < 3; i++) limitador({}, criarRes(), next);
    const res = criarRes();
    limitador({}, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(429);
    expect(res.body).toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    expect(Number(res.headers['Retry-After'])).toBeLessThan(61);
  });

  test('o bloqueio não deixa a requisição seguir para a rota', () => {
    const limitador = criarLimitador({ janelaMs: MIN, maximo: 1, chave: () => 'a' });
    const next = jest.fn();

    limitador({}, criarRes(), next);
    limitador({}, criarRes(), next);

    expect(next.mock.calls).toHaveLength(1);
  });

  test('reabre quando a janela passa', () => {
    let agora = 1000;
    const limitador = criarLimitador({ janelaMs: MIN, maximo: 1, chave: () => 'a', agora: () => agora });

    limitador({}, criarRes(), jest.fn());
    const bloqueada = criarRes();
    limitador({}, bloqueada, jest.fn());
    agora += MIN + 1;
    const next = jest.fn();
    limitador({}, criarRes(), next);

    expect(bloqueada.statusCode).toBe(429);
    expect(next).toHaveBeenCalled();
  });

  test('cada chave tem o seu contador (conexões diferentes não se atrapalham)', () => {
    const limitador = criarLimitador({ janelaMs: MIN, maximo: 1, chave: (req) => req.ip });
    const next = jest.fn();

    limitador({ ip: '1.1.1.1' }, criarRes(), next);
    limitador({ ip: '2.2.2.2' }, criarRes(), next);

    expect(next.mock.calls).toHaveLength(2);
  });

  test('contarSomenteFalhas: respostas de sucesso não contam, as de erro sim', () => {
    const limitador = criarLimitador({ janelaMs: MIN, maximo: 2, chave: () => 'a', contarSomenteFalhas: true });
    const next = jest.fn();

    for (let i = 0; i < 5; i++) {
      const res = criarRes();
      limitador({}, res, next);
      res.terminar(200);
    }
    expect(next.mock.calls).toHaveLength(5);

    for (let i = 0; i < 2; i++) {
      const res = criarRes();
      limitador({}, res, next);
      res.terminar(401);
    }
    const bloqueada = criarRes();
    limitador({}, bloqueada, next);

    expect(bloqueada.statusCode).toBe(429);
  });

  test('DESLIGAR_LIMITES=true libera tudo (para testes e desenvolvimento)', () => {
    process.env.DESLIGAR_LIMITES = 'true';
    const limitador = criarLimitador({ janelaMs: MIN, maximo: 1, chave: () => 'a' });
    const next = jest.fn();

    limitador({}, criarRes(), next);
    limitador({}, criarRes(), next);
    delete process.env.DESLIGAR_LIMITES;

    expect(next.mock.calls).toHaveLength(2);
  });
});

describe('antiSpamLead', () => {
  const corpoValido = { nome: 'Mariana Silva', email: 'mariana@exemplo.com', telefone: '81999990001', mensagem: 'Interesse em: Araçá Prime' };

  test('formulário normal segue para a rota, com o texto limpo', () => {
    const req = { body: { ...corpoValido, nome: '  Mariana Silva \u0007 ' } };
    const next = jest.fn();

    antiSpamLead(req, criarRes(), next);

    expect(next).toHaveBeenCalled();
    expect(req.body.nome).toBe('Mariana Silva');
  });

  test('campo-armadilha preenchido: responde sucesso, mas não cria o lead', () => {
    const req = { body: { ...corpoValido, website: 'http://spam.com' } };
    const res = criarRes();
    const next = jest.fn();

    antiSpamLead(req, res, next);

    expect(res.statusCode).toBe(201);
    expect(next).not.toHaveBeenCalled();
  });

  test('mensagem que é só um punhado de links é descartada em silêncio', () => {
    const res = criarRes();
    const next = jest.fn();

    antiSpamLead({ body: { ...corpoValido, mensagem: 'http://a.com http://b.com https://c.com' } }, res, next);

    expect(res.statusCode).toBe(201);
    expect(next).not.toHaveBeenCalled();
  });

  test('um ou dois links na mensagem ainda passam', () => {
    const next = jest.fn();

    antiSpamLead({ body: { ...corpoValido, mensagem: 'Vi no https://site.com' } }, criarRes(), next);

    expect(next).toHaveBeenCalled();
  });

  test('corta textos enormes nos limites', () => {
    const req = { body: { ...corpoValido, nome: 'a'.repeat(500), mensagem: 'b'.repeat(5000) } };

    antiSpamLead(req, criarRes(), jest.fn());

    expect(req.body.nome).toHaveLength(120);
    expect(req.body.mensagem).toHaveLength(1000);
  });

  test('corpo ausente não derruba a rota', () => {
    const next = jest.fn();

    antiSpamLead({}, criarRes(), next);

    expect(next).toHaveBeenCalled();
  });
});

describe('CORS', () => {
  test('em produção, CORS_ORIGIN aceita várias origens, ignora espaços e a barra final, e só elas passam', () => {
    const lista = origensPermitidas({ NODE_ENV: 'production', CORS_ORIGIN: ' https://placebrokers.com.br/ , https://www.placebrokers.com.br' });

    expect(lista).toEqual(['https://placebrokers.com.br', 'https://www.placebrokers.com.br']);
  });

  test('fora de produção, o front local continua liberado mesmo com CORS_ORIGIN apontando para o site de produção', () => {
    const lista = origensPermitidas({ CORS_ORIGIN: 'https://placebrokers.com.br' });

    expect(lista).toContain('https://placebrokers.com.br');
    expect(lista).toContain('http://localhost:5173');
  });

  test('não repete origem quando ela está nas duas listas', () => {
    const lista = origensPermitidas({ CORS_ORIGIN: 'http://localhost:5173' });

    expect(lista.filter((o) => o === 'http://localhost:5173')).toHaveLength(1);
  });

  test('sem a variável, em desenvolvimento, só o front local passa', () => {
    expect(origensPermitidas({})).toEqual(['http://localhost:5173', 'http://127.0.0.1:5173']);
  });

  test('sem a variável, em produção, ninguém passa', () => {
    expect(origensPermitidas({ NODE_ENV: 'production' })).toEqual([]);
  });

  test('origem fora da lista é recusada; sem Origin (curl, servidor) passa', () => {
    const lista = ['https://placebrokers.com.br'];

    expect(origemPermitida('https://placebrokers.com.br', lista)).toBe(true);
    expect(origemPermitida('https://site-malicioso.com', lista)).toBe(false);
    expect(origemPermitida(undefined, lista)).toBe(true);
  });
});

describe('aplicarErros', () => {
  function montar() {
    const camadas = [];
    aplicarErros({ use: (fn) => camadas.push(fn) });
    return { rota404: camadas[0], erro: camadas[1] };
  }

  test('rota que não existe responde 404 em JSON', () => {
    const res = criarRes();
    montar().rota404({}, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
  });

  test('JSON quebrado responde 400, e conteúdo grande demais responde 413', () => {
    const { erro } = montar();
    const quebrado = Object.assign(new SyntaxError('Unexpected token'), { body: '{' });
    const r1 = criarRes();
    const r2 = criarRes();

    erro(quebrado, {}, r1, jest.fn());
    erro({ type: 'entity.too.large' }, {}, r2, jest.fn());

    expect(r1.statusCode).toBe(400);
    expect(r2.statusCode).toBe(413);
  });

  test('erro inesperado responde 500 sem vazar a mensagem interna', () => {
    const { erro } = montar();
    const res = criarRes();
    const original = console.error;
    console.error = () => {};

    erro(new Error('senha do banco: 1234'), {}, res, jest.fn());
    console.error = original;

    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body).includes('1234')).toBe(false);
  });
});
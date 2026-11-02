'use strict';

const { VigiaSeguranca, mascararIp } = require('./avisosSeguranca');

function montar() {
  let t = Date.parse('2026-11-02T12:00:00Z');
  const criarAviso = jest.fn().mockResolvedValue({});
  const vigia = new VigiaSeguranca({ criarAviso, agora: () => t, log: { error: jest.fn() } });
  return { vigia, criarAviso, passar: (ms) => { t += ms; } };
}

const MIN = 60 * 1000;
const ultimoAviso = (criarAviso) => criarAviso.mock.calls[criarAviso.mock.calls.length - 1][0];

describe('avisos de segurança', () => {
  test('mascara o IP (LGPD)', () => {
    expect(mascararIp('189.12.34.56')).toBe('189.12.x.x');
    expect(mascararIp('::ffff:10.0.0.7')).toBe('10.0.x.x');
    expect(mascararIp('')).toBe('IP desconhecido');
  });

  test('login bloqueado por e-mail vira aviso crítico e não repete em 30 min', async () => {
    const { vigia, criarAviso, passar } = montar();
    expect(await vigia.loginBloqueado({ email: 'ana@place.com', ip: '189.12.34.56' })).toBe(true);
    const aviso = ultimoAviso(criarAviso);
    expect(aviso.severidade).toBe('critico');
    expect(aviso.descricao.includes('ana@place.com')).toBe(true);
    expect(aviso.descricao.includes('189.12.x.x')).toBe(true);
    expect(aviso.descricao.includes('34.56')).toBe(false);

    expect(await vigia.loginBloqueado({ email: 'ana@place.com', ip: '1.2.3.4' })).toBe(false);
    passar(31 * MIN);
    expect(await vigia.loginBloqueado({ email: 'ana@place.com', ip: '1.2.3.4' })).toBe(true);
  });

  test('acesso negado só avisa a partir da 5ª vez em 10 minutos', async () => {
    const { vigia, criarAviso, passar } = montar();
    const user = { id: 'c1', nome: 'Bruno', cargo: 'corretor' };
    for (let i = 0; i < 4; i += 1) expect(await vigia.acessoNegado({ user, caminho: '/admin/equipe' })).toBe(false);
    passar(11 * MIN); // as 4 primeiras saem da janela
    for (let i = 0; i < 4; i += 1) await vigia.acessoNegado({ user, caminho: '/equipe' });
    expect(criarAviso).not.toHaveBeenCalled();
    expect(await vigia.acessoNegado({ user, caminho: '/equipe?x=1' })).toBe(true);
    const aviso = ultimoAviso(criarAviso);
    expect(aviso.titulo).toBe('Tentativas de abrir área sem permissão');
    expect(aviso.descricao.includes('Bruno (corretor)')).toBe(true);
    expect(aviso.descricao.includes('x=1')).toBe(false);
  });

  test('muitos documentos abertos em 10 minutos', async () => {
    const { vigia, criarAviso } = montar();
    const user = { id: 'c2', nome: 'Carla', cargo: 'corretor' };
    for (let i = 0; i < 19; i += 1) await vigia.documentoAberto({ user });
    expect(criarAviso).not.toHaveBeenCalled();
    expect(await vigia.documentoAberto({ user })).toBe(true);
    expect(ultimoAviso(criarAviso).severidade).toBe('atencao');
  });

  test('spam no formulário a partir do 3º bloqueio na hora', async () => {
    const { vigia, criarAviso } = montar();
    await vigia.spamNoFormulario({ ip: '200.1.2.3' });
    await vigia.spamNoFormulario({ ip: '200.1.2.3' });
    expect(criarAviso).not.toHaveBeenCalled();
    await vigia.spamNoFormulario({ ip: '200.1.2.3' });
    expect(ultimoAviso(criarAviso).descricao.includes('200.1.x.x')).toBe(true);
  });

  test('senha alterada e conta bloqueada tentando entrar', async () => {
    const { vigia, criarAviso } = montar();
    await vigia.senhaAlterada({ email: 'ana@place.com' });
    expect(ultimoAviso(criarAviso).titulo).toBe('Senha alterada');
    await vigia.contaBloqueadaTentouEntrar({ email: 'x@place.com', motivo: 'recusado' });
    expect(ultimoAviso(criarAviso).descricao.includes('recusado')).toBe(true);
  });

  test('erro ao gravar o aviso não estoura', async () => {
    const vigia = new VigiaSeguranca({ criarAviso: jest.fn().mockRejectedValue(new Error('banco fora')), log: { error: jest.fn() } });
    expect(await vigia.senhaAlterada({ email: 'a@b.com' })).toBe(false);
  });
});

describe('limitador avisa uma vez quando bloqueia', () => {
  const { criarLimitador } = require('../middlewares/seguranca');
  test('aoBloquear roda só no primeiro bloqueio da janela', () => {
    const aoBloquear = jest.fn();
    const limitador = criarLimitador({ janelaMs: 60000, maximo: 2, aoBloquear });
    const res = { statusCode: 200, setHeader: jest.fn(), status(n) { this.statusCode = n; return this; }, json: jest.fn(), on: jest.fn() };
    const req = { ip: '1.2.3.4', body: {} };
    for (let i = 0; i < 5; i += 1) limitador(req, res, jest.fn());
    expect(aoBloquear).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(429);
  });
});

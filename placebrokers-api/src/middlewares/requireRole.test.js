
'use strict';

const { requireRole } = require('./requireRole');

function simularAcesso(cargo, cargosPermitidos) {
  const req = {
    user: cargo ? { id: 'usuario-teste', cargo } : null,
  };

  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };

  const next = jest.fn();

  requireRole(...cargosPermitidos)(req, res, next);

  return { res, next };
}

describe('Permissões por cargo', () => {
  test('visitante não autenticado recebe HTTP 401', () => {
    const { res, next } = simularAcesso(null, ['admin']);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('administrador acessa rota administrativa', () => {
    const { res, next } = simularAcesso('admin', ['admin']);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test.each(['corretor', 'gerente', 'viabilizador'])(
    '%s não acessa rota exclusiva de administrador',
    (cargo) => {
      const { res, next } = simularAcesso(cargo, ['admin']);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    }
  );

  test.each(['admin', 'corretor', 'gerente'])(
    '%s pode acessar rota de documentos comerciais',
    (cargo) => {
      const { next } = simularAcesso(
        cargo,
        ['admin', 'corretor', 'gerente']
      );

      expect(next).toHaveBeenCalledTimes(1);
    }
  );

  test('viabilizador não acessa documentos comerciais internos', () => {
    const { res, next } = simularAcesso(
      'viabilizador',
      ['admin', 'corretor', 'gerente']
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('viabilizador acessa sua própria área', () => {
    const { next } = simularAcesso(
      'viabilizador',
      ['viabilizador']
    );

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('retorna código FORBIDDEN para cargo não autorizado', () => {
    const { res } = simularAcesso('corretor', ['admin']);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'FORBIDDEN',
      })
    );
  });
});

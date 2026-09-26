'use strict';

function requireRole(...cargosPermitidos) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ code: 'UNAUTHENTICATED', message: 'Faça login primeiro.' });
    }
    if (!cargosPermitidos.includes(req.user.cargo)) {
      return res.status(403).json({ code: 'FORBIDDEN', message: 'Você não tem permissão para isso.' });
    }
    next();
  };
}

module.exports = { requireRole };
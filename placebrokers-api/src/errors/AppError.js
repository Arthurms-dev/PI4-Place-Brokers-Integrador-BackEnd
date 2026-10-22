'use strict';

const STATUS_BY_CODE = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SERVER_ERROR: 500,
};

class AppError extends Error {
  constructor(code, message, fieldErrors = {}, cause) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    // Aceita (code, message, fieldErrors, cause) e chamadas legadas
    // (code, message, statusCode, fieldErrors).
    const statusExplicito = typeof fieldErrors === 'number' ? fieldErrors : null;
    const detalhes = statusExplicito == null ? fieldErrors :
      (cause && typeof cause === 'object' ? cause : {});
    this.fieldErrors = detalhes;
    this.statusCode = statusExplicito ?? STATUS_BY_CODE[code] ?? 500;
    if (statusExplicito == null && cause) this.cause = cause;
  }
}

module.exports = { AppError, STATUS_BY_CODE };
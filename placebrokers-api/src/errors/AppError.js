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
    this.fieldErrors = fieldErrors;
    this.statusCode = STATUS_BY_CODE[code] ?? 500;
    if (cause) this.cause = cause;
  }
}

module.exports = { AppError, STATUS_BY_CODE };
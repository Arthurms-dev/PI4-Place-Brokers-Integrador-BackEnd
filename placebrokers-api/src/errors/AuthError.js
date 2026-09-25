'use strict';

const STATUS_BY_CODE = {
  VALIDATION_ERROR: 400,
  INVALID_CREDENTIALS: 401,
  USER_INACTIVE: 403,
  USER_ALREADY_EXISTS: 409,
  SERVER_ERROR: 500,
};

class AuthError extends Error {
  /**
   * @param {"VALIDATION_ERROR"|"INVALID_CREDENTIALS"|"USER_INACTIVE"|"USER_ALREADY_EXISTS"|"SERVER_ERROR"} code
   * @param {string} message
   * @param {Record<string,string>} [fieldErrors] 
   * @param {unknown} [cause] 
   */
  constructor(code, message, fieldErrors = {}, cause) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.statusCode = STATUS_BY_CODE[code] ?? 500;
    if (cause) this.cause = cause;
  }
}

module.exports = { AuthError, STATUS_BY_CODE };

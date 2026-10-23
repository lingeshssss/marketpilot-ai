export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what = 'Resource') => new AppError(404, 'not_found', `${what} not found`);
export const badRequest = (msg, details) => new AppError(400, 'invalid_request', msg, details);
export const unauthorized = () => new AppError(401, 'unauthenticated', 'Sign in to continue');

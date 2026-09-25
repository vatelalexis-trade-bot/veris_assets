import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Protection against cross-site request forgery (docs/ARCHITECTURE.md §4.12): a browser always
 * sends an Origin header with a state-changing request; it must be the web app's own origin.
 * Requests without Origin (server-to-server calls, command-line tools) carry no browser cookie
 * risk and are let through; SameSite=Lax cookies complete the protection.
 */
export function createOriginCheck(allowedOrigins: readonly string[]) {
  const allowed = new Set(allowedOrigins.map((origin) => new URL(origin).origin));
  return (req: Request, _res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;
    if (SAFE_METHODS.has(req.method) || origin === undefined || allowed.has(origin)) {
      next();
      return;
    }
    next(new AppError('PERMISSION_DENIED', [{ code: 'ORIGIN_NOT_ALLOWED', field: null }]));
  };
}

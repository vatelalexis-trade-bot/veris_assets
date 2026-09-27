import type { NextFunction, Request, Response } from 'express';

/**
 * Security headers of every API response (SPEC §24, P16-1). The API only returns JSON and files
 * sent as attachments: nothing it returns may run scripts, be framed or be cached. The interactive
 * documentation (outside production) keeps its own scripts.
 */
export function securityHeaders(docsPath: string) {
  return (request: Request, response: Response, next: NextFunction): void => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    // Responses hold personal and financial data: never kept by browsers or proxies.
    response.setHeader('Cache-Control', 'no-store');
    if (!request.path.startsWith(docsPath)) {
      response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    }
    next();
  };
}

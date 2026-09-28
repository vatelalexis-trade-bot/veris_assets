import type { NextFunction, Request, Response } from 'express';

/**
 * Online, the visitor's address reaches the API through two proxies (the hosting's edge, then the
 * web app), and X-Forwarded-For ends with the edge's own address. The edge writes the visitor's
 * address in a header of its own (X-Real-IP on Railway), overwriting any value the visitor sent:
 * it becomes the X-Forwarded-For seen by Express, whose "trust proxy" setting still limits it to
 * requests coming from the web app (D-106).
 */
export function clientIpFromHeader(header: string) {
  const name = header.toLowerCase();
  return (request: Request, _response: Response, next: NextFunction): void => {
    const value = request.headers[name];
    const address = Array.isArray(value) ? value[0] : value;
    if (address) request.headers['x-forwarded-for'] = address.trim();
    next();
  };
}

import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthContext, RequestInfo } from '../application/authentication.service.js';

export type AuthenticatedRequest = Request & { auth?: AuthContext };

/** Request data handed to Better Auth. The client address comes from Express ("trust proxy"). */
export function requestInfo(req: Request): RequestInfo {
  const headers = new Headers();
  if (req.headers.cookie) headers.set('cookie', req.headers.cookie);
  const userAgent = req.headers['user-agent'] ?? null;
  if (userAgent) headers.set('user-agent', userAgent);
  const ip = req.ip ?? null;
  if (ip) headers.set('x-forwarded-for', ip);
  return { headers, ip, userAgent };
}

/** Forwards the cookies issued by Better Auth (session, second-factor step) to the browser. */
export function sendCookies(res: Response, cookies: string[]): void {
  for (const cookie of cookies) res.append('Set-Cookie', cookie);
}

/** The signed-in user of the request, set by AuthGuard. */
export const CurrentAuth = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const auth = context.switchToHttp().getRequest<AuthenticatedRequest>().auth;
  if (!auth) throw new Error('CurrentAuth used on a route without authentication');
  return auth;
});

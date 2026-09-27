import createMiddleware from 'next-intl/middleware';
import { NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const handleI18nRouting = createMiddleware(routing);

/**
 * Content Security Policy of the pages (SPEC §24, P16-1, D-100). Scripts run only with the nonce
 * drawn for this request (Next.js adds it to its own scripts); styles allow inline attributes,
 * which React components and Next.js images use. Everything else comes from this origin only.
 */
export function contentSecurityPolicy(nonce: string, options: { dev: boolean; https: boolean }) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${options.dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(options.https ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

// Next.js 16 "proxy" (formerly middleware): draws the nonce of the page, then redirects to the
// visitor's language and keeps the language prefix in every URL. API calls, Next.js internals and
// static files are left untouched.
export default function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const policy = contentSecurityPolicy(nonce, {
    dev: process.env.NODE_ENV === 'development',
    https: (process.env.WEB_ORIGIN ?? '').startsWith('https://'),
  });
  // Next.js reads the policy from the request to put the nonce on the scripts it renders.
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', policy);
  const response = handleI18nRouting(new NextRequest(request, { headers }));
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next|_vercel|.*\\..*).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};

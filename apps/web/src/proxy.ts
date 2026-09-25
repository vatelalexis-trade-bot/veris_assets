import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// Next.js 16 "proxy" (formerly middleware): redirects to the visitor's language and keeps the
// language prefix in every URL. API calls, Next.js internals and static files are left untouched.
export default createMiddleware(routing);

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};

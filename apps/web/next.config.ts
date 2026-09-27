import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// Loads the translations of the current language on every request (src/i18n/request.ts).
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// In GitHub Codespaces the app is opened through <codespace>-3000.<forwarding domain>;
// the dev server must accept that origin (it only allows localhost by default).
const codespacesDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;

// The browser only talks to this app; /api/* is relayed to the NestJS API (decision D-004),
// so that session cookies stay on a single origin.
const apiUrl = `http://${process.env.API_HOST ?? '127.0.0.1'}:${process.env.API_PORT ?? '4000'}`;

const nextConfig: NextConfig = {
  // Workspace packages are compiled by Next.js like local code.
  transpilePackages: ['@veris/shared'],
  allowedDevOrigins: codespacesDomain ? [`*.${codespacesDomain}`] : [],
  rewrites() {
    return Promise.resolve([{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }]);
  },
  // Security headers of every response (SPEC §24, P16-1); the Content Security Policy of the
  // pages is set per request in src/proxy.ts, with its nonce.
  headers() {
    return Promise.resolve([
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
          // Only honoured by browsers over HTTPS (the online demonstration).
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
    ]);
  },
  poweredByHeader: false,
};

export default withNextIntl(nextConfig);

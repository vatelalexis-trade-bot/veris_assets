import type { NextConfig } from 'next';

// In GitHub Codespaces the app is opened through <codespace>-3000.<forwarding domain>;
// the dev server must accept that origin (it only allows localhost by default).
const codespacesDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;

// The browser only talks to this app; /api/* is relayed to the NestJS API (decision D-004),
// so that session cookies stay on a single origin.
const apiUrl = `http://${process.env.API_HOST ?? '127.0.0.1'}:${process.env.API_PORT ?? '4000'}`;

const nextConfig: NextConfig = {
  // Workspace packages are compiled by Next.js like local code.
  transpilePackages: ['@virtus/shared'],
  allowedDevOrigins: codespacesDomain ? [`*.${codespacesDomain}`] : [],
  rewrites() {
    return Promise.resolve([{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }]);
  },
};

export default nextConfig;

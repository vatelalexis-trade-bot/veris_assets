import type { NextConfig } from 'next';

// In GitHub Codespaces the app is opened through <codespace>-3000.<forwarding domain>;
// the dev server must accept that origin (it only allows localhost by default).
const codespacesDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;

const nextConfig: NextConfig = {
  // Workspace packages are compiled by Next.js like local code.
  transpilePackages: ['@virtus/shared'],
  allowedDevOrigins: codespacesDomain ? [`*.${codespacesDomain}`] : [],
};

export default nextConfig;

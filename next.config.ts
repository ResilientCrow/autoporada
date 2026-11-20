import type { NextConfig } from 'next';

import { STATIC_HEADERS } from './src/server/http';

const config: NextConfig = {
  // Self-contained server bundle for the Docker image (ADR 0008).
  output: 'standalone',
  poweredByHeader: false,
  // Only TypeScript is served, so the entry-point inventory sees every route (ADR 0011).
  pageExtensions: ['ts', 'tsx'],
  reactStrictMode: true,
  // Every page is per-user and the CSP uses per-request nonces: no Cache
  // Components. The root layout calls connection(), so no route is
  // prerendered either (ADR 0001).
  cacheComponents: false,
  // The nonce CSP is set per request by src/proxy.ts.
  headers: async () => [{ source: '/:path*', headers: [...STATIC_HEADERS] }],
  experimental: {
    // Upgrade reminders only for published security advisories (Next's default, pinned).
    agentUpgrade: 'security',
  },
};

export default config;

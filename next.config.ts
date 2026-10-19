import type { NextConfig } from 'next';

const config: NextConfig = {
  // Self-contained server bundle for the Docker image (ADR 0008).
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  // Every page is per-user and the CSP uses per-request nonces: no Cache
  // Components. The root layout calls connection(), so no route is
  // prerendered either (ADR 0001).
  cacheComponents: false,
  experimental: {
    // Matches INPUT_LIMITS in src/application/core (ADR 0011).
    serverActions: { bodySizeLimit: '512kb' },
  },
};

export default config;

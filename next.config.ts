import type { NextConfig } from 'next';

const config: NextConfig = {
  // Self-contained server bundle for the Docker image (ADR 0008).
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  // Every page is per-user and the CSP uses per-request nonces, so nothing is
  // pre-rendered or cached (ADR 0001).
  cacheComponents: false,
};

export default config;

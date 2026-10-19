import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  resolve: { alias: { '@': src } },
  test: {
    // Domain rules depend on the clock and the zone; tests pin both explicitly.
    env: { TZ: 'UTC' },
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: [
            'src/**/*.test.{ts,tsx}',
            'test/support/**/*.test.ts',
            'test/contract/**/*.test.ts',
          ],
          environment: 'node',
          // Port contracts and use cases run against in-memory fakes (ADR 0011).
          provide: { world: 'fake' },
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          environment: 'node',
          // Each test file gets its own database, cloned from a migrated template.
          globalSetup: ['test/integration/global-setup.ts'],
          fileParallelism: true,
        },
      },
      {
        extends: true,
        test: { name: 'golden', include: ['test/document/**/*.test.ts'], environment: 'node' },
      },
      {
        // Needs Gotenberg and poppler-utils: pnpm dev:services, then pnpm test:render.
        extends: true,
        test: {
          name: 'render',
          include: ['test/render/**/*.test.ts'],
          environment: 'node',
          testTimeout: 60_000,
        },
      },
    ],
  },
});

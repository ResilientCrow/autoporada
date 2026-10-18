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
        test: { name: 'unit', include: ['src/**/*.test.{ts,tsx}'], environment: 'node' },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          environment: 'node',
          // Each worker gets its own database cloned from a migrated template.
          fileParallelism: true,
        },
      },
      {
        extends: true,
        test: { name: 'golden', include: ['test/document/**/*.test.ts'], environment: 'node' },
      },
    ],
  },
});

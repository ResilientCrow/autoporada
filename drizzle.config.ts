import { defineConfig } from 'drizzle-kit';

/**
 * `pnpm db:generate` turns schema changes into reviewable SQL in drizzle/.
 * Triggers, functions and grants go into custom migrations:
 * `pnpm db:generate --custom --name=<what>`.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/infra/db/schema/index.ts',
  out: './drizzle',
  casing: 'snake_case',
});

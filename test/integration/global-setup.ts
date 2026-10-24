/**
 * Builds the template database every integration test file clones: the
 * migrations run once per change of drizzle/, not once per file.
 */
import { ensureTemplate } from '../support/template-db';

export default async function setup(): Promise<void> {
  await ensureTemplate();
}

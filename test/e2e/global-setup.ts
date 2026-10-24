/**
 * Every run gets its own database, cloned from the migrated template and
 * seeded. Playwright starts the web server before this runs, so nothing may
 * touch the e2e database earlier (the pool is lazy) and this never calls /auth/*;
 * a reused server survives the drop with one connection warning.
 */
import { databaseUrl, ensureTemplate, recreateFromTemplate } from '../support/template-db';

import { E2E_DATABASE } from './db';
import { seed } from './seed';

export default async function setup(): Promise<void> {
  await ensureTemplate();
  await recreateFromTemplate(E2E_DATABASE);
  await seed(databaseUrl(E2E_DATABASE));
}

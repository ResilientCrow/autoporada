import { getConfig } from '@/infra/config';
import { createLogger } from '@/infra/log';

/**
 * Composition root of the web process. Boot validates the configuration
 * before the first request, so a misconfigured server refuses to start.
 */
export function bootWeb(): void {
  const config = getConfig();
  createLogger({ service: 'web', level: config.logLevel }).info(
    { environment: config.environment },
    'web process configured',
  );
}

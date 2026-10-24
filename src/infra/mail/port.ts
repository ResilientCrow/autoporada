import type { Clock, MailPort } from '@/application/ports';
import type { Config } from '@/infra/config';
import type { AppTokenSource } from '@/infra/oidc';

import { createGraphMail, type HttpFetch } from './graph';

/** The transport the configuration names: Graph in production, SMTP (Mailpit) in development. */
export function createMailPort(
  config: Pick<Config, 'environment' | 'graphBaseUrl' | 'mail'>,
  parts: { readonly tokens: AppTokenSource; readonly fetch?: HttpFetch; readonly clock: Clock },
): MailPort {
  if (config.environment === 'production' && config.mail.transport !== 'graph') {
    throw new Error('MAIL_TRANSPORT must be graph in production');
  }
  if (config.mail.transport === 'smtp') {
    throw new Error('MAIL_TRANSPORT=smtp: the SMTP transport is not built yet');
  }
  return createGraphMail({ ...parts, baseUrl: config.graphBaseUrl, mailbox: config.mail.from });
}

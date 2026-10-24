import type { Clock, MailPort } from '@/application/ports';
import type { Config } from '@/infra/config';
import type { AppTokenSource } from '@/infra/oidc';

import { createGraphMail, type HttpFetch } from './graph';
import { createSmtpMail } from './smtp';

/** The transport the configuration names: Graph in production, SMTP (Mailpit) in development. */
export function createMailPort(
  config: Pick<Config, 'environment' | 'graphBaseUrl' | 'mail'>,
  parts: { readonly tokens: AppTokenSource; readonly fetch?: HttpFetch; readonly clock: Clock },
): MailPort {
  if (config.environment === 'production' && config.mail.transport !== 'graph') {
    throw new Error('MAIL_TRANSPORT must be graph in production');
  }
  if (config.mail.transport === 'smtp') {
    return createSmtpMail({ url: config.mail.smtpUrl, from: config.mail.from, clock: parts.clock });
  }
  return createGraphMail({ ...parts, baseUrl: config.graphBaseUrl, mailbox: config.mail.from });
}

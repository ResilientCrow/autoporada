import * as client from 'openid-client';

import type { IdpDetail, IdpFailure } from '@/application/ports';

import { assertOutsideTransaction } from '../system';
import { discover, type ProviderOptions } from './discovery';
import { mapFailure } from './failure';

const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';
const DAY = 86_400_000;
/** The ops check warns the IT contact this long before the certificate expires (plan §4). */
const WARN_DAYS = 45;

export interface ProbeReport {
  readonly issuer: string;
  readonly credential:
    | { readonly kind: 'secret' }
    | {
        readonly kind: 'certificate';
        readonly sha1: string;
        readonly subject: string;
        readonly daysLeft: number;
      };
  readonly accepted: boolean;
  readonly failure?: { readonly failure: IdpFailure; readonly detail: IdpDetail };
  /** Application roles Entra granted, read from the Graph access token. */
  readonly roles: readonly string[];
  readonly warnings: readonly string[];
}

/** The `roles` of an access token; it is not verified, the probe only reports it. */
function rolesOf(accessToken: string): string[] {
  try {
    const payload: unknown = JSON.parse(
      Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString('utf8'),
    );
    const roles =
      typeof payload === 'object' && payload !== null && 'roles' in payload ? payload.roles : [];
    return Array.isArray(roles) ? roles.filter((r): r is string => typeof r === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Asks Entra for a Graph token with the app's own credential (client
 * credentials grant), so a refused certificate shows up before any browser
 * test (deploy/SMOKE-TEST.md). Reports facts only: never a key or a token.
 */
export async function probeEntra(options: ProviderOptions, now: Date): Promise<ProbeReport> {
  assertOutsideTransaction('Entra probe');
  const { credential } = options;
  const warnings: string[] = [];
  const facts: ProbeReport['credential'] =
    credential.kind === 'secret'
      ? { kind: 'secret' }
      : {
          kind: 'certificate',
          sha1: credential.sha1,
          subject: credential.subject,
          daysLeft: Math.floor((credential.notAfter.getTime() - now.getTime()) / DAY),
        };
  if (facts.kind === 'certificate' && facts.daysLeft < 0)
    warnings.push('the certificate has expired');
  else if (facts.kind === 'certificate' && facts.daysLeft < WARN_DAYS) {
    warnings.push(`the certificate expires in ${facts.daysLeft} days: renew it (ENTRA-SETUP §6)`);
  }
  try {
    const config = await discover(options);
    const tokens = await client.clientCredentialsGrant(config, { scope: GRAPH_SCOPE });
    const roles = rolesOf(tokens.access_token);
    if (roles.includes('Mail.Send')) {
      warnings.push(
        'Mail.Send is granted in Entra and covers every mailbox: remove it (ENTRA-SETUP §1.4)',
      );
    }
    return { issuer: options.issuer, credential: facts, accepted: true, roles, warnings };
  } catch (error) {
    const mapped = mapFailure(error, 'token');
    if (!mapped) throw error;
    return {
      issuer: options.issuer,
      credential: facts,
      accepted: false,
      failure: mapped,
      roles: [],
      warnings,
    };
  }
}

/** The report as lines for the terminal. */
export function formatProbe(report: ProbeReport): string[] {
  const credential =
    report.credential.kind === 'secret'
      ? 'credential: client secret (development only)'
      : `credential: certificate ${report.credential.subject}, SHA-1 ${report.credential.sha1}, ${report.credential.daysLeft} days left`;
  const answer = report.accepted
    ? 'Entra accepted the credential'
    : `Entra refused: ${report.failure?.failure ?? 'unknown'} ${[report.failure?.detail.error, report.failure?.detail.aadsts].filter(Boolean).join(' ')}`.trim();
  return [
    `issuer: ${report.issuer}`,
    credential,
    answer,
    `roles: ${report.roles.length > 0 ? report.roles.join(', ') : '(none)'}`,
    ...report.warnings.map((w) => `WARNING: ${w}`),
  ];
}

import type { Role, UserStatus } from '@/domain/actor';

import type { SignInPurpose } from './session';

export interface BootstrapFacts {
  /** BOOTSTRAP_HEADMASTER_OID, if set. */
  readonly configuredOid: string | null;
  readonly oid: string;
  readonly purpose: SignInPurpose;
  readonly role: Role;
  readonly status: UserStatus;
  readonly activeHeadmasters: number;
}

/**
 * The first headmaster (plan §4): only while no active headmaster exists,
 * only for the configured account, only at a login. It never demotes
 * anyone, and the database keeps one active headmaster from then on, so it
 * happens once.
 */
export function bootstrapsHeadmaster(facts: BootstrapFacts): boolean {
  return (
    facts.configuredOid !== null &&
    facts.configuredOid.toLowerCase() === facts.oid.toLowerCase() &&
    facts.purpose === 'login' &&
    facts.status === 'active' &&
    facts.role !== 'headmaster' &&
    facts.activeHeadmasters === 0
  );
}

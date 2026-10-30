import type { Actor } from '@/domain/actor';
import { readScope, type Scope, type ScopedResource } from '@/domain/policy';

/** Why the system acts on its own. Logged and written to the audit log. */
export type SystemReason =
  | 'auth.login'
  | 'auth.callback'
  | 'auth.session'
  /** Test data; the fake world's audit check skips it. */
  | 'test.seed'
  | `job:${string}`
  | `cli:${string}`;

export interface UserPrincipal {
  readonly kind: 'user';
  /** Role and status as read from the database for this request (plan §4). */
  readonly actor: Actor;
  readonly sessionId: string;
  /** When the user last signed in at Entra; step-up needs it fresh (ADR 0002). */
  readonly authTime: Date;
}

export interface SystemPrincipal {
  readonly kind: 'system';
  readonly reason: SystemReason;
}

/** Who a transaction runs for. There is no anonymous principal. */
export type Principal = UserPrincipal | SystemPrincipal;

export const system = (reason: SystemReason): SystemPrincipal => ({ kind: 'system', reason });

/** The rows a principal may see: everything for the system, the policy's scope for users. */
export function scopeOf(principal: Principal, resource: ScopedResource): Scope {
  return principal.kind === 'system' ? { kind: 'all' } : readScope(principal.actor, resource);
}

/** A scope narrowed to the principal's own rows, whatever else it admits. */
const ownOf = (scope: Scope): Scope =>
  scope.kind === 'own-or-approved-akce' || scope.kind === 'own-or-submitted'
    ? { kind: 'own', userId: scope.userId }
    : scope;

/**
 * Who may read a future item's history, with the reviewers' notes in it: its author, and the
 * reviewers where they may see the item. The read scope also shows a colleague every approved
 * akce, and that widens the item, not its review trail.
 */
export function futureHistoryScopeOf(principal: Principal): Scope {
  const scope = scopeOf(principal, 'futureItem');
  return scope.kind === 'own-or-approved-akce' ? ownOf(scope) : scope;
}

/**
 * Who may lock and change a future item: its author, and the system. Whatever else a user
 * may read is not theirs to write. The reviewers' decisions (approve, return, reject, a
 * reviewer's edit) get a scope of their own, `own-or-submitted`, on the path that adds them
 * (design row 55); this one stays the author's.
 */
export function futureWriteScopeOf(principal: Principal): Scope {
  return ownOf(scopeOf(principal, 'futureItem'));
}

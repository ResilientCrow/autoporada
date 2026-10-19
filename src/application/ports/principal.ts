import type { Actor } from '@/domain/actor';
import { readScope, type Scope, type ScopedResource } from '@/domain/policy';

/** Why the system acts on its own. Logged and written to the audit log. */
export type SystemReason =
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

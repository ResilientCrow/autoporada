import type { Actor } from '@/domain/actor';
import type { FutureKind } from '@/domain/calendar';
import type { FutureState } from '@/domain/review';

import { can } from './policy';

/** Kinds of rows a repository filters by who is asking (ADR 0011). */
export type ScopedResource = 'user' | 'accessRequest' | 'point' | 'futureItem';

/** Which rows an actor may see; repositories turn it into SQL, fakes into a filter. */
export type Scope =
  | { readonly kind: 'all' }
  | { readonly kind: 'own'; readonly userId: string }
  /** Submitters see their own future items and every approved akce (plan §4). */
  | { readonly kind: 'own-or-approved-akce'; readonly userId: string }
  | { readonly kind: 'none' };

/** A row as a scope sees it. `kind` and `state` matter for future items only. */
export interface ScopedRow {
  readonly ownerId: string;
  readonly kind?: FutureKind;
  readonly state?: FutureState;
}

/** No user has an empty id, so a row owned by it belongs to somebody else. */
const SOMEONE_ELSE = '';

/**
 * The rows `actor` may see, asked of `can()` itself, so the scope can never
 * drift from the policy. A property test proves `admits(readScope(…))`
 * agrees with `can(…view…)` for every row.
 */
export function readScope(actor: Actor, resource: ScopedResource): Scope {
  const own = { kind: 'own', userId: actor.id } as const;
  switch (resource) {
    case 'user':
      if (can(actor, { action: 'users.view' })) return { kind: 'all' };
      return can(actor, { action: 'profile.manage' }) ? own : { kind: 'none' };
    case 'accessRequest':
      if (can(actor, { action: 'access.decide' })) return { kind: 'all' };
      return can(actor, { action: 'access.request' }) || can(actor, { action: 'profile.manage' })
        ? own
        : { kind: 'none' };
    case 'point': {
      const view = (authorId: string) => can(actor, { action: 'point.view', point: { authorId } });
      if (view(SOMEONE_ELSE)) return { kind: 'all' };
      return view(actor.id) ? own : { kind: 'none' };
    }
    case 'futureItem': {
      const view = (authorId: string) =>
        can(actor, {
          action: 'future.view',
          item: { authorId, kind: 'jednani', state: 'draft' },
        });
      if (view(SOMEONE_ELSE)) return { kind: 'all' };
      return view(actor.id) ? { kind: 'own-or-approved-akce', userId: actor.id } : { kind: 'none' };
    }
  }
}

/** Whether `row` is inside `scope`. */
export function admits(scope: Scope, row: ScopedRow): boolean {
  switch (scope.kind) {
    case 'all':
      return true;
    case 'none':
      return false;
    case 'own':
      return row.ownerId === scope.userId;
    case 'own-or-approved-akce':
      return row.ownerId === scope.userId || (row.kind === 'akce' && row.state === 'approved');
  }
}

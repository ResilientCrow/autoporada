import { and, eq, or, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import type { Scope } from '@/domain/policy';

/** The columns a scope filters on. Future items also need kind and state. */
export interface ScopeColumns {
  readonly owner: AnyPgColumn;
  readonly kind?: AnyPgColumn;
  readonly state?: AnyPgColumn;
}

/**
 * A scope as a WHERE condition: the SQL projection of `admits()` from
 * domain/policy. Undefined means no filter.
 */
export function scopeWhere(scope: Scope, columns: ScopeColumns): SQL | undefined {
  switch (scope.kind) {
    case 'all':
      return undefined;
    case 'none':
      return sql`false`;
    case 'own':
      return eq(columns.owner, scope.userId);
    case 'own-or-approved-akce':
      if (!columns.kind || !columns.state) {
        throw new Error('scopeWhere: own-or-approved-akce needs kind and state columns');
      }
      return or(
        eq(columns.owner, scope.userId),
        and(eq(columns.kind, 'akce'), eq(columns.state, 'approved')),
      );
  }
}

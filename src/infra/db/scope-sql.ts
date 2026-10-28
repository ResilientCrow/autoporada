import { and, eq, isNotNull, ne, or, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import type { Scope } from '@/domain/policy';

/**
 * The columns a scope filters on. Points also need state and submittedAt,
 * future items kind, state and submittedAt.
 */
export interface ScopeColumns {
  readonly owner: AnyPgColumn;
  readonly kind?: AnyPgColumn;
  readonly state?: AnyPgColumn;
  /** Set at every submit and cleared by a retract (ADR 0026): not null means "handed in". */
  readonly submittedAt?: AnyPgColumn;
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
    case 'own-or-submitted':
      if (!columns.state || !columns.submittedAt) {
        throw new Error('scopeWhere: own-or-submitted needs state and submittedAt columns');
      }
      return or(
        eq(columns.owner, scope.userId),
        and(isNotNull(columns.submittedAt), ne(columns.state, 'draft')),
      );
  }
}

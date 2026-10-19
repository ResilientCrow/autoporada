import type { AuditTarget } from '@/application/ports';

import type { FakeTxState } from './state';

/** A commit wrote a row in an audited table without saying so (ADR 0011). */
export class UnauditedWrite extends Error {
  override readonly name = 'UnauditedWrite';
}

const key = (t: AuditTarget) => `${t.type}:${t.id}`;

/**
 * Every row a transaction wrote must be named by one of its audit events,
 * as the target or among the related rows, or be exempted on purpose.
 */
export function checkAuditCoverage(tx: FakeTxState, auditBefore: number): void {
  const covered = new Set(tx.exempted.map(key));
  for (const row of tx.draft.audit.slice(auditBefore)) {
    if (row.targetType && row.targetId) covered.add(`${row.targetType}:${row.targetId}`);
    const related = (row.data['related'] ?? []) as readonly AuditTarget[];
    for (const target of related) covered.add(key(target));
  }
  const missing = tx.written.map(key).filter((k) => !covered.has(k));
  if (missing.length > 0) throw new UnauditedWrite(`no audit event names ${missing.join(', ')}`);
}

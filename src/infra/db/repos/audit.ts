import type { AuditPort, TxContext } from '@/application/ports';

import { auditEvents } from '../schema';
import type { TxDatabase } from './database';

/** Writes audit events in the caller's transaction; the database stamps `at`. */
export function createAuditWriter(db: TxDatabase, ctx: TxContext): AuditPort {
  const { principal } = ctx;
  return {
    async record(event) {
      await db.insert(auditEvents).values({
        actorId: principal.kind === 'user' ? principal.actor.id : null,
        action: event.action,
        targetType: event.target?.type ?? null,
        targetId: event.target?.id ?? null,
        data: {
          ...(event.diff && { diff: event.diff }),
          ...(event.meta && { meta: event.meta }),
          ...(event.related && { related: event.related }),
          ...(principal.kind === 'system' && { system: principal.reason }),
        },
        requestId: ctx.requestId,
      });
    },
    // Exemptions are checked by the fake world's audit oracle only.
    exempt() {},
  };
}

import type { AuditPort, JobPort, TxContext } from '@/application/ports';

import { guard } from './guards';
import type { FakeTxState } from './state';

export function fakeAudit(tx: FakeTxState, ctx: TxContext): AuditPort {
  const { principal } = ctx;
  return {
    async record(event) {
      guard(tx, true);
      tx.draft.audit.push({
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
    exempt(_reason, target) {
      guard(tx, false);
      tx.exempted.push(target);
    },
  };
}

export function fakeJobs(tx: FakeTxState): JobPort {
  return {
    async enqueue(name, data, options) {
      guard(tx, true);
      // As pg-boss's deterministic id does: a job with this queue and key exists (committed
      // or in this transaction, the draft holds both), so this one is a no-op.
      const exists = tx.draft.jobs.some(
        (job) => job.name === name && job.options.dedupeKey === options.dedupeKey,
      );
      if (!exists) tx.draft.jobs.push({ name, data, options });
    },
  };
}

import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { createdAt, id } from './columns';

/**
 * Append-only audit log (plan §4). Triggers (migration 0004) refuse every
 * UPDATE and TRUNCATE, refuse deletes younger than the retention period and
 * stamp `at` with the transaction time, for the owner as much as for the app.
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: id(),
    at: createdAt(),
    /**
     * The acting user; empty for the system (jobs, bootstrap). No foreign key:
     * erasing a user must not rewrite the log.
     */
    actorId: uuid(),
    /** What happened, e.g. `user.role.change`, `point.transition`. */
    action: text().notNull(),
    targetType: text(),
    targetId: uuid(),
    /** Details and diffs; never tokens, never request bodies. */
    data: jsonb().$type<Readonly<Record<string, unknown>>>().notNull().default({}),
    /** Correlates the event with the request's log lines. */
    requestId: text(),
  },
  (t) => [
    index('audit_events_at_idx').on(t.at),
    index('audit_events_target_idx').on(t.targetType, t.targetId),
    index('audit_events_actor_idx').on(t.actorId),
  ],
);

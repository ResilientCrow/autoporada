import type { Tx } from '@/application/ports';
import type { Actor } from '@/domain/actor';

/**
 * The actor as their own row says now, with the row locked. The pipeline
 * decided on the session's view of the user, read before the transaction,
 * so a write that grants or changes access asks `can()` again of this. A
 * use case locks it after its other rows: two of them can then only wait on
 * each other when two headmasters change each other at once, and the
 * deadlock that ends runs the loser again. Null when the row is gone.
 */
export async function lockedActor(tx: Tx, actor: Actor): Promise<Actor | null> {
  const row = await tx.users.lock(actor.id);
  return row && { id: row.id, role: row.role, status: row.status, isStudent: row.isStudent };
}

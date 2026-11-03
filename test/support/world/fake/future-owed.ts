import type { FakeFutureItem, FakeState } from './state';

/**
 * The fake of `owedAkce` (infra/db/repos/future-owed): an akce that is approved, or back in review
 * (`submitted`, `returned`) after its author's revise of an approved one, which the append-only
 * events remember (a decision into `approved` or a change out of it).
 */
export function isOwedAkce(
  state: Pick<FakeState, 'futureEvents'>,
  item: Pick<FakeFutureItem, 'id' | 'kind' | 'state'>,
): boolean {
  if (item.kind !== 'akce') return false;
  if (item.state === 'approved') return true;
  if (item.state !== 'submitted' && item.state !== 'returned') return false;
  return [...state.futureEvents.values()].some(
    (e) => e.futureItemId === item.id && (e.fromState === 'approved' || e.toState === 'approved'),
  );
}

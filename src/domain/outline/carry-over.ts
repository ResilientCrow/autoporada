import type { SystemSlot } from './model';

export interface IssueItemLike<Body> {
  /** Identity of an item across issues, so its history can be followed. */
  readonly lineageId: string;
  readonly position: number;
  readonly persistence: 'standing' | 'once';
  readonly slot: SystemSlot | null;
  readonly body: Body;
}

/** Ohlasy are news of one week: the slot stays, its content does not. */
const PER_ISSUE_CONTENT: ReadonlySet<SystemSlot> = new Set(['media', 'partners']);

/**
 * What the next issue starts with: system slots and standing items in their
 * current order (renumbered), one-time items dropped, ohlasy emptied.
 */
export function planCarryOver<Body, I extends IssueItemLike<Body>>(
  items: readonly I[],
  emptyBody: Body,
): I[] {
  return [...items]
    .sort((a, b) => a.position - b.position)
    .filter((item) => item.slot !== null || item.persistence === 'standing')
    .map((item, position) => ({
      ...item,
      position,
      ...(item.slot !== null && PER_ISSUE_CONTENT.has(item.slot) && { body: emptyBody }),
    }));
}

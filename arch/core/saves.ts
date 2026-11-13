/**
 * When a queued save may go to the server. A save goes once the typing pauses, so typing never
 * runs into the `autosave` rate limit (120 a minute); typing that never pauses still saves after
 * `MAX_WAIT_MS`.
 */
import type { Op } from './ops';

/** The pause after the last keystroke. */
export const DEBOUNCE_MS = 1_500;
/** The longest a save waits for a pause. */
export const MAX_WAIT_MS = 10_000;

/** Saves of one thing: only the newest of a run needs to reach the server. */
export const COALESCED = new Set<string>(['savePoint', 'saveFuture', 'annexes', 'setAnnex2']);

/** A queued op and, for a save the screen made, when it was typed (ms). */
export type Queued = Op & { at?: number };

const thing = (op: Queued): string | null => (COALESCED.has(op.k) && op.a[0] !== null && op.a[0] !== undefined ? `${op.k}:${String(op.a[0])}` : null);

/**
 * Milliseconds the head of the queue still waits; 0 sends it now. An action queued behind a save
 * needs it on the server first, so it sends the save at once; so does `flush` (the tab is hidden).
 */
export function headWait(queue: readonly Queued[], now: number, flush = false): number {
  const head = queue[0];
  const key = head ? thing(head) : null;
  if (!head || flush || key === null || head.at === undefined) return 0;
  if (queue.some((x) => thing(x) === null)) return 0;
  const last = Math.max(...queue.filter((x) => thing(x) === key).map((x) => x.at ?? -Infinity));
  return Math.max(0, Math.min(last + DEBOUNCE_MS - now, head.at + MAX_WAIT_MS - now));
}

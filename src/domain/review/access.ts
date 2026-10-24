import { addDays, instantToWallClock, wallClockToInstant, wallTime } from '@/domain/time';

import type { AccessState } from './states';

/** After a rejection the person waits this many days before asking again. */
export const ACCESS_COOLDOWN_DAYS = 30;
export const ACCESS_REASON_MAX = 1000;

export interface AccessHistoryItem {
  readonly id: string;
  readonly state: AccessState;
  readonly createdAt: Date;
  readonly decidedAt: Date | null;
}

/** Where a person stands when they want to ask for access. */
export type RequestStanding =
  | { readonly kind: 'open'; readonly previous: 'rejected' | 'cancelled' | null }
  | { readonly kind: 'pending'; readonly requestId: string }
  | { readonly kind: 'cooldown'; readonly decidedAt: Date; readonly until: Date }
  | { readonly kind: 'blocked'; readonly decidedAt: Date };

/** 00:00 Prague time on the day of the decision plus `ACCESS_COOLDOWN_DAYS`. */
export function cooldownEnd(decidedAt: Date): Date {
  const { date } = instantToWallClock(decidedAt);
  return wallClockToInstant(addDays(date, ACCESS_COOLDOWN_DAYS), wallTime(0, 0));
}

/**
 * Every rule about asking for access, in order: blocked, pending, cooldown,
 * open. `history` is the person's requests, newest first. Cancelling and
 * approval never start a cooldown.
 */
export function requestStanding(history: readonly AccessHistoryItem[], now: Date): RequestStanding {
  const decided = (item: AccessHistoryItem) => item.decidedAt ?? item.createdAt;

  const blocked = history.find((item) => item.state === 'blocked');
  if (blocked) return { kind: 'blocked', decidedAt: decided(blocked) };

  const pending = history.find((item) => item.state === 'pending');
  if (pending) return { kind: 'pending', requestId: pending.id };

  const newest = history[0];
  if (newest?.state === 'rejected') {
    const until = cooldownEnd(decided(newest));
    if (now.getTime() < until.getTime()) {
      return { kind: 'cooldown', decidedAt: decided(newest), until };
    }
  }
  const previous =
    newest?.state === 'rejected' || newest?.state === 'cancelled' ? newest.state : null;
  return { kind: 'open', previous };
}

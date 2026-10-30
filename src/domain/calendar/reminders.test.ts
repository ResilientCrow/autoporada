import { describe, expect, it } from 'vitest';

import { calDate } from '@/domain/time';

import {
  REMINDER_STAGGER_MS,
  activeSince,
  reminderDue,
  reminderSlot,
  reminderStagger,
} from './index';

/** Sunday 25 October 2026 18.00 Prague (the night the clocks go back): the default deadline of Monday 26 October. */
const DEADLINE = new Date('2026-10-25T17:00:00Z');
const HOUR = 3_600_000;

describe('reminderSlot', () => {
  it('puts the soft reminder two days before the deadline at 13.00 and the hard one on the day at 12.00', () => {
    expect(reminderSlot('soft', DEADLINE)).toEqual(new Date('2026-10-23T11:00:00Z'));
    expect(reminderSlot('hard', DEADLINE)).toEqual(new Date('2026-10-25T11:00:00Z'));
  });

  it('counts the Prague day of a deadline that falls just after midnight', () => {
    const late = new Date('2026-10-25T23:30:00Z');
    expect(reminderSlot('hard', late)).toEqual(new Date('2026-10-26T11:00:00Z'));
  });
});

describe('reminderDue', () => {
  const slot = reminderSlot('soft', DEADLINE);

  it('opens at the slot and closes six hours later', () => {
    expect(reminderDue('soft', DEADLINE, new Date(slot.getTime() - 1))).toBe(false);
    expect(reminderDue('soft', DEADLINE, slot)).toBe(true);
    expect(reminderDue('soft', DEADLINE, new Date(slot.getTime() + 6 * HOUR - 1))).toBe(true);
    expect(reminderDue('soft', DEADLINE, new Date(slot.getTime() + 6 * HOUR))).toBe(false);
  });

  it('closes at the deadline when that comes first', () => {
    // The hard slot is 12.00; the deadline is 18.00, six hours on, so make it earlier: 14.00.
    const early = new Date('2026-10-25T13:00:00Z');
    expect(reminderDue('hard', early, new Date('2026-10-25T12:59:59Z'))).toBe(true);
    expect(reminderDue('hard', early, early)).toBe(false);
  });

  it('never opens for a deadline at or before its own slot', () => {
    const morning = new Date('2026-10-25T09:00:00Z');
    expect(reminderDue('hard', morning, morning)).toBe(false);
    expect(reminderDue('hard', morning, new Date('2026-10-25T08:00:00Z'))).toBe(false);
  });
});

describe('reminderStagger', () => {
  it('is the same for the same recipient and within 30 minutes', () => {
    const ids = ['a', 'b', '0198f3a2-7c1e-7b52-9d4a-5e6f70812345', ''];
    for (const id of ids) {
      expect(reminderStagger(id)).toBe(reminderStagger(id));
      expect(reminderStagger(id)).toBeGreaterThanOrEqual(0);
      expect(reminderStagger(id)).toBeLessThan(REMINDER_STAGGER_MS);
    }
  });

  it('spreads recipients over the half hour', () => {
    const offsets = new Set(Array.from({ length: 60 }, (_, i) => reminderStagger(`user-${i}`)));
    expect(offsets.size).toBeGreaterThan(30);
  });
});

describe('activeSince', () => {
  it('is 1 September, Prague midnight, of the school year of the day', () => {
    expect(activeSince(calDate(2026, 10, 25))).toEqual(new Date('2026-08-31T22:00:00Z'));
    expect(activeSince(calDate(2027, 3, 1))).toEqual(new Date('2026-08-31T22:00:00Z'));
    expect(activeSince(calDate(2026, 9, 1))).toEqual(new Date('2026-08-31T22:00:00Z'));
    expect(activeSince(calDate(2026, 8, 31))).toEqual(new Date('2025-08-31T22:00:00Z'));
  });
});

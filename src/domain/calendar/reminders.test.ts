import { describe, expect, it } from 'vitest';

import { calDate, parseIsoDate } from '@/domain/time';

import {
  REMINDER_STAGGER_MS,
  activeSince,
  deadline,
  reminderDue,
  reminderSlot,
  reminderStagger,
} from './index';

/** Saturday 24 October 2026 20.00 Prague (the night before the clocks go back): the default deadline of Monday 26 October. */
const DEADLINE = new Date('2026-10-24T18:00:00Z');
const HOUR = 3_600_000;

describe('reminderSlot', () => {
  it('puts the soft reminder two days before the deadline at 13.00 and the hard one on the day at 12.00', () => {
    expect(reminderSlot('soft', DEADLINE)).toEqual(new Date('2026-10-22T11:00:00Z'));
    expect(reminderSlot('hard', DEADLINE)).toEqual(new Date('2026-10-24T10:00:00Z'));
  });

  it.each([
    [
      '2026-10-27',
      '2026-10-23T11:00:00Z',
      '2026-10-25T11:00:00Z',
      'the clocks go back on its deadline day',
    ],
    [
      '2027-03-30',
      '2027-03-26T12:00:00Z',
      '2027-03-28T10:00:00Z',
      'the clocks go forward on its deadline day',
    ],
  ])('puts the slots of the meeting on %s at %s and %s: %s', (meeting, softAt, hardAt) => {
    const closes = deadline(parseIsoDate(meeting));
    expect(reminderSlot('soft', closes)).toEqual(new Date(softAt));
    expect(reminderSlot('hard', closes)).toEqual(new Date(hardAt));
  });

  it.each(['2026-10-26', '2026-10-27', '2027-03-29', '2027-03-30'])(
    'opens both reminders before the default deadline of the meeting on %s, the DST weekends included',
    (meeting) => {
      const closes = deadline(parseIsoDate(meeting));
      expect(reminderSlot('soft', closes).getTime()).toBeLessThan(
        reminderSlot('hard', closes).getTime(),
      );
      expect(reminderSlot('hard', closes).getTime()).toBeLessThan(closes.getTime());
      expect(reminderDue('soft', closes, reminderSlot('soft', closes))).toBe(true);
      expect(reminderDue('hard', closes, reminderSlot('hard', closes))).toBe(true);
    },
  );

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
    // The hard slot is 12.00; the deadline is 20.00, eight hours on, so make it earlier: 14.00.
    const early = new Date('2026-10-24T12:00:00Z');
    expect(reminderDue('hard', early, new Date('2026-10-24T11:59:59Z'))).toBe(true);
    expect(reminderDue('hard', early, early)).toBe(false);
  });

  it('never opens for a deadline at or before its own slot', () => {
    const morning = new Date('2026-10-24T08:00:00Z');
    expect(reminderDue('hard', morning, morning)).toBe(false);
    expect(reminderDue('hard', morning, new Date('2026-10-24T07:00:00Z'))).toBe(false);
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

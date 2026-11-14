import { describe, expect, it } from 'vitest';
import { deadline } from '@/domain/calendar';
import { calDate } from '@/domain/time';
import { poradaDates } from './select';

// A porada moved from its Monday to Wednesday 18 November 2026; the default rule closes it two days before, at 20.00.
const meetingDate = calDate(2026, 11, 18);
const slot = { meetingDate, deadlineAt: deadline(meetingDate) };
const saturday = new Date('2026-11-14T13:30:00Z');

describe('poradaDates: the day a porada meets and its uzávěrka, apart', () => {
  it('names the porada by the day it meets, not by its uzávěrka', () => {
    expect(poradaDates(slot, saturday).meets).toBe('ve středu 18. 11.');
  });

  it('names the uzávěrka by its own day and Prague time', () => {
    expect(poradaDates(slot, saturday).close).toBe('v pondělí 16. 11. v 20:00');
  });

  it('says whether the uzávěrka has passed', () => {
    expect(poradaDates(slot, saturday).closed).toBe(false);
    expect(poradaDates(slot, slot.deadlineAt).closed).toBe(true);
  });

  it('prints a close at midnight as the last minute of the day before', () => {
    const midnight = { meetingDate, deadlineAt: new Date('2026-11-15T23:00:00Z') };
    expect(poradaDates(midnight, saturday).close).toBe('v neděli 15. 11. v 23:59');
  });
});

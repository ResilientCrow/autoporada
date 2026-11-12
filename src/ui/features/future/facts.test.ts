import { describe, expect, it } from 'vitest';

import { whenText, type FutureView } from './facts';

const view = (over: Partial<FutureView> = {}): FutureView => ({
  title: 'Lyžák',
  startDate: '2026-11-10',
  endDate: null,
  timeFrom: null,
  timeTo: null,
  campus: null,
  place: null,
  organizer: null,
  participants: null,
  note: null,
  ...over,
});

describe('whenText', () => {
  it.each([
    [{ startDate: null }, null],
    [{}, '10. 11. 2026'],
    [{ endDate: '2026-11-12' }, '10.–12. 11. 2026'],
    [{ timeFrom: '08:00' }, '10. 11. 2026, 8:00 hodin'],
    [{ timeFrom: '08:00', timeTo: '10:30' }, '10. 11. 2026, 8:00 až 10:30 hodin'],
    [{ endDate: '2026-11-12', timeFrom: '08:00' }, '10.–12. 11. 2026, 8:00 hodin'],
    [{ timeTo: '10:30' }, '10. 11. 2026'],
    [{ startDate: null, timeFrom: '08:00' }, null],
  ] as const)('writes %j as %j', (over, expected) => {
    expect(whenText(view(over))).toBe(expected);
  });
});

import { describe, expect, it } from 'vitest';

import { DIGEST_FALLBACK_MS, digestSince, digestSlot } from './index';

describe('digestSlot', () => {
  it.each([
    ['2026-10-26T06:00:00Z', '07'], // 07.00 Prague (CET), the morning run
    ['2026-10-26T06:59:00Z', '07'],
    ['2026-10-26T13:59:00Z', '07'], // 14.59 Prague: a morning run held up by an outage is still the morning's
    ['2026-10-26T14:00:00Z', '15'], // 15.00 Prague
    ['2026-10-26T22:30:00Z', '15'],
    ['2026-10-26T00:10:00Z', '07'],
    ['2026-07-14T05:00:00Z', '07'], // 07.00 Prague (CEST)
    ['2026-07-14T13:00:00Z', '15'], // 15.00 Prague (CEST)
    ['2026-07-14T12:59:00Z', '07'], // 14.59 Prague (CEST)
  ] as const)('puts %s in the %s slot, by the Prague clock', (instant, slot) => {
    expect(digestSlot(new Date(instant))).toBe(slot);
  });
});

describe('digestSince', () => {
  const NOW = new Date('2026-10-26T14:00:00Z');

  it('counts from the last digest sent, however long ago', () => {
    const last = new Date('2026-10-23T14:00:00Z');
    expect(digestSince(last, NOW)).toBe(last);
  });

  it('counts the last 24 hours for someone never mailed one', () => {
    expect(DIGEST_FALLBACK_MS).toBe(86_400_000);
    expect(digestSince(null, NOW)).toEqual(new Date('2026-10-25T14:00:00Z'));
  });
});

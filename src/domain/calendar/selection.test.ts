import { describe, expect, it } from 'vitest';

import { parseIsoDate as d, toIsoDate } from '@/domain/time';

import { dueMonday } from './index';

const due = (earliest: string, handIn: string) =>
  toIsoDate(dueMonday({ earliest: d(earliest), handIn: d(handIn) }));

describe('dueMonday', () => {
  it('is the first Monday when it is the later', () => {
    expect(due('2026-11-09', '2026-10-26')).toBe('2026-11-09');
  });

  it('is the hand-in Monday when it is the later: a resubmit after the first Monday', () => {
    expect(due('2026-10-26', '2026-11-09')).toBe('2026-11-09');
  });

  it('is that Monday when both are the same', () => {
    expect(due('2026-10-26', '2026-10-26')).toBe('2026-10-26');
  });
});

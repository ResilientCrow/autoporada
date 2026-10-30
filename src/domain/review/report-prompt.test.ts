import { describe, expect, it } from 'vitest';

import { addDays, calDate } from '@/domain/time';

import { reportPromptStage, reportPromptWindow } from './index';

const TODAY = calDate(2026, 11, 20);
const lastDay = (daysAgo: number) => addDays(TODAY, -daysAgo);

describe('reportPromptWindow', () => {
  it('spans the 21 days before today and excludes today', () => {
    expect(reportPromptWindow(TODAY)).toEqual({
      from: calDate(2026, 10, 30),
      to: calDate(2026, 11, 19),
    });
  });

  it('crosses a month and a year end', () => {
    expect(reportPromptWindow(calDate(2027, 1, 5))).toEqual({
      from: calDate(2026, 12, 15),
      to: calDate(2027, 1, 4),
    });
  });
});

describe('reportPromptStage', () => {
  it.each([
    [0, null],
    [1, 1],
    [7, 1],
    [8, 2],
    [21, 2],
    [22, null],
  ] as const)('an akce that ended %i days ago is at stage %s', (daysAgo, stage) => {
    expect(reportPromptStage(lastDay(daysAgo), TODAY)).toBe(stage);
  });

  it('is null for an akce that has not ended yet', () => {
    expect(reportPromptStage(calDate(2026, 11, 21), TODAY)).toBeNull();
  });
});

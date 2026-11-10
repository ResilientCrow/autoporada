import { describe, expect, it } from 'vitest';

import { placementLines, type StripItem, type StripWindow } from './placement';

const window = (over: Partial<StripWindow> = {}): StripWindow => ({
  stripFrom: '2026-11-09',
  issues: [],
  ...over,
});
const item = (over: Partial<StripItem> = {}): StripItem => ({
  kind: 'akce',
  startDate: '2026-11-10',
  endDate: null,
  ...over,
});
const slots = (i: StripItem, w: StripWindow = window()) =>
  placementLines(i, w).map((line) => [line.monday, line.slot]);

describe('placementLines', () => {
  it('names the next four Mondays from the submit Monday', () => {
    expect(placementLines(item(), window()).map((line) => line.monday)).toEqual([
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ]);
  });

  it('puts an akce of this week in the overview of akce, and drops it once it is over', () => {
    expect(slots(item())).toEqual([
      ['2026-11-09', 'events'],
      ['2026-11-16', 'hidden'],
      ['2026-11-23', 'hidden'],
      ['2026-11-30', 'hidden'],
    ]);
  });

  it('puts a later akce among the other known akce until it comes within two weeks', () => {
    expect(slots(item({ startDate: '2026-11-30' }))).toEqual([
      ['2026-11-09', 'later'],
      ['2026-11-16', 'events'],
      ['2026-11-23', 'events'],
      ['2026-11-30', 'events'],
    ]);
  });

  it('keeps a multi-day akce in until its last day has passed', () => {
    expect(slots(item({ startDate: '2026-11-09', endDate: '2026-11-20' }))).toEqual([
      ['2026-11-09', 'events'],
      ['2026-11-16', 'events'],
      ['2026-11-23', 'hidden'],
      ['2026-11-30', 'hidden'],
    ]);
  });

  it('puts a jednání in the overview of jednání for its own week only', () => {
    expect(slots(item({ kind: 'jednani', startDate: '2026-11-12' }))).toEqual([
      ['2026-11-09', 'meetings'],
      ['2026-11-16', 'hidden'],
      ['2026-11-23', 'hidden'],
      ['2026-11-30', 'hidden'],
    ]);
  });

  it('leaves out a Monday with no porada: no row up to plannedThrough', () => {
    const planned = window({
      plannedThrough: '2026-11-16',
      issues: [{ monday: '2026-11-09', meetingDate: '2026-11-09', status: 'open' }],
    });
    expect(placementLines(item(), planned).map((line) => line.monday)).toEqual([
      '2026-11-09',
      '2026-11-23',
      '2026-11-30',
    ]);
  });

  it('keeps a Monday with a row and one after the boundary', () => {
    const planned = window({ plannedThrough: '2026-11-09', issues: [] });
    expect(placementLines(item(), planned).map((line) => line.monday)).toEqual([
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ]);
  });

  it('leaves out a Monday whose issue is already made', () => {
    const made = window({
      issues: [{ monday: '2026-11-09', meetingDate: '2026-11-09', status: 'generated' }],
    });
    expect(placementLines(item(), made).map((line) => line.monday)).toEqual([
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ]);
  });

  it('shows nothing before the item has a start date', () => {
    expect(placementLines(item({ startDate: null }), window())).toEqual([]);
    expect(placementLines(item({ startDate: null, endDate: '2026-11-12' }), window())).toEqual([]);
  });

  it('ignores an end date before the start, which a draft may hold but a save refuses', () => {
    expect(slots(item({ startDate: '2026-11-10', endDate: '2026-11-02' }))[0]).toEqual([
      '2026-11-09',
      'events',
    ]);
  });
});

import { describe, expect, it } from 'vitest';

import { POINT_LIMITS } from '@/domain/report';
import { calDate, wallTime } from '@/domain/time';

import { createFutureInput, saveFutureInput } from './future';

const id = '00000000-0000-4000-8000-000000000001';
const wire = (over: Record<string, unknown> = {}) => ({
  title: 'Výlet do Prahy',
  startDate: '2026-11-10',
  endDate: null,
  timeFrom: null,
  timeTo: null,
  campus: null,
  place: null,
  organizer: null,
  organizerRole: null,
  participants: null,
  participantsAddress: null,
  note: null,
  ...over,
});
const save = (over: Record<string, unknown> = {}) =>
  saveFutureInput.safeParse({ id, expectedVersion: 1, content: wire(over) });

/** The field paths a refused parse names, so a test pins which field was refused. */
const refusedPaths = (result: ReturnType<typeof save>) =>
  result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));

describe('createFutureInput', () => {
  it('takes a client ref and a kind, nothing else', () => {
    const input = { clientRef: id, kind: 'akce' };
    expect(createFutureInput.safeParse(input).success).toBe(true);
    expect(createFutureInput.safeParse({ ...input, kind: 'report' }).success).toBe(false);
    expect(createFutureInput.safeParse({ ...input, title: 'x' }).success).toBe(false);
  });
});

describe('saveFutureInput', () => {
  it('has no switch for the report: every approved akce owes one (ADR 0048)', () => {
    expect(save().success).toBe(true);
    expect(save({ expectsReport: false }).success).toBe(false);
  });

  it('reads dates and times from ISO text into domain values', () => {
    const result = save({ endDate: '2026-11-11', timeFrom: '08:00', timeTo: '14:30' });
    expect(result.success && result.data.content).toMatchObject({
      startDate: calDate(2026, 11, 10),
      endDate: calDate(2026, 11, 11),
      timeFrom: wallTime(8, 0),
      timeTo: wallTime(14, 30),
    });
  });

  it('refuses text that is no date or time, as an issue on that field', () => {
    expect(refusedPaths(save({ startDate: '2026-13-40' }))).toEqual(['content.startDate']);
    expect(refusedPaths(save({ timeFrom: '25:99' }))).toEqual(['content.timeFrom']);
  });

  it('refuses an end date before the start or with no start (future_items_dates)', () => {
    expect(refusedPaths(save({ endDate: '2026-11-09' }))).toEqual(['content.endDate']);
    expect(refusedPaths(save({ startDate: null, endDate: '2026-11-09' }))).toEqual([
      'content.endDate',
    ]);
    expect(save({ endDate: '2026-11-10' }).success).toBe(true);
  });

  it('bounds the title, the place and the free-text fields', () => {
    expect(save({ title: 'x'.repeat(POINT_LIMITS.title) }).success).toBe(true);
    expect(refusedPaths(save({ title: 'x'.repeat(POINT_LIMITS.title + 1) }))).toEqual([
      'content.title',
    ]);
    expect(refusedPaths(save({ place: 'x'.repeat(POINT_LIMITS.place + 1) }))).toEqual([
      'content.place',
    ]);
    expect(refusedPaths(save({ organizer: 'x'.repeat(POINT_LIMITS.organizer + 1) }))).toEqual([
      'content.organizer',
    ]);
    expect(refusedPaths(save({ participants: 'x'.repeat(POINT_LIMITS.participants + 1) }))).toEqual(
      ['content.participants'],
    );
    expect(refusedPaths(save({ note: 'x'.repeat(POINT_LIMITS.futureNote + 1) }))).toEqual([
      'content.note',
    ]);
  });

  it('takes the two organizer roles and null, and nothing else (ADR 0063)', () => {
    expect(save({ organizerRole: 'organizes' }).success).toBe(true);
    expect(save({ organizerRole: 'coordinates' }).success).toBe(true);
    expect(save({ organizerRole: null }).success).toBe(true);
    expect(refusedPaths(save({ organizerRole: 'leads' }))).toEqual(['content.organizerRole']);
    expect(refusedPaths(save({ organizerRole: '' }))).toEqual(['content.organizerRole']);
    const { organizerRole: _omitted, ...without } = wire();
    expect(saveFutureInput.safeParse({ id, expectedVersion: 1, content: without }).success).toBe(
      false,
    );
  });

  it('takes the four participants addresses and null, and nothing else (ADR 0071)', () => {
    for (const address of ['slecny-a-panove', 'slecny', 'panove', 'bez-osloveni', null]) {
      expect(save({ participantsAddress: address }).success).toBe(true);
    }
    expect(refusedPaths(save({ participantsAddress: 'damy' }))).toEqual([
      'content.participantsAddress',
    ]);
    expect(refusedPaths(save({ participantsAddress: '' }))).toEqual([
      'content.participantsAddress',
    ]);
    const { participantsAddress: _omitted, ...without } = wire();
    expect(saveFutureInput.safeParse({ id, expectedVersion: 1, content: without }).success).toBe(
      false,
    );
  });

  it('takes a known campus and no stray keys', () => {
    expect(save({ campus: 'jinde-nekde' }).success).toBe(false);
    expect(save({ extra: 1 }).success).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import { parseIsoDate as d, type CalDate } from '@/domain/time';
import type { SnapshotReport } from '@/snapshot';

import { snapshotFixture } from '../../../test/support/snapshots';
import { reportOnDays } from './index';

type Dated = Pick<SnapshotReport, 'date' | 'endDate' | 'timeFrom' | 'timeTo'>;
interface Days {
  readonly start: CalDate;
  readonly end?: CalDate;
}

const template = snapshotFixture('template-replica');

/** A whole report of the template with the case's own dates and times. */
function report(dated: Dated): SnapshotReport {
  const [first] = template.reports;
  if (!first) throw new Error('the template has no report');
  const { date: _date, endDate: _end, timeFrom: _from, timeTo: _to, ...rest } = first;
  return { ...rest, ...dated };
}

const ONE_DAY: Days = { start: d('2026-10-22') };
const TWO_DAYS: Days = { start: d('2026-10-22'), end: d('2026-10-23') };

describe('reportOnDays: a report on the days of its akce (ADR 0049)', () => {
  it.each<[string, Dated, Days, Dated]>([
    [
      'a report that ran overnight loses its end time on a one-day akce',
      { date: '2026-10-22', endDate: '2026-10-23', timeFrom: '18:00', timeTo: '8:00' },
      ONE_DAY,
      { date: '2026-10-22', timeFrom: '18:00' },
    ],
    [
      'an end time equal to the start goes too',
      { date: '2026-10-22', endDate: '2026-10-23', timeFrom: '18:00', timeTo: '18:00' },
      ONE_DAY,
      { date: '2026-10-22', timeFrom: '18:00' },
    ],
    [
      'times that run forwards stay on one day',
      { date: '2026-10-21', endDate: '2026-10-23', timeFrom: '8:00', timeTo: '16:30' },
      ONE_DAY,
      { date: '2026-10-22', timeFrom: '8:00', timeTo: '16:30' },
    ],
    [
      'an akce of several days gives its end date',
      { date: '2026-10-22', timeFrom: '18:00', timeTo: '19:00' },
      TWO_DAYS,
      { date: '2026-10-22', endDate: '2026-10-23', timeFrom: '18:00', timeTo: '19:00' },
    ],
    [
      'overnight times stay over several days',
      { date: '2026-10-20', endDate: '2026-10-21', timeFrom: '18:00', timeTo: '8:00' },
      TWO_DAYS,
      { date: '2026-10-22', endDate: '2026-10-23', timeFrom: '18:00', timeTo: '8:00' },
    ],
    [
      'an end on the start day is one day',
      { date: '2026-10-22', endDate: '2026-10-23', timeFrom: '18:00', timeTo: '8:00' },
      { start: d('2026-10-22'), end: d('2026-10-22') },
      { date: '2026-10-22', timeFrom: '18:00' },
    ],
    [
      'a start time alone stays',
      { date: '2026-10-20', timeFrom: '18:00' },
      ONE_DAY,
      { date: '2026-10-22', timeFrom: '18:00' },
    ],
    [
      'no times, none added',
      { date: '2026-10-20', endDate: '2026-10-21' },
      ONE_DAY,
      { date: '2026-10-22' },
    ],
  ])('%s', (_name, own, days, expected) => {
    const result = reportOnDays(report(own), days);

    // Strictly: a time or an end date that goes is absent, and nothing else changes.
    expect(result).toStrictEqual(report(expected));
    // Whatever the report's own days and times were, the snapshot takes it.
    expect(() =>
      snapshotFixture('template-replica', (raw) => {
        raw['reports'] = [result];
      }),
    ).not.toThrow();
  });
});

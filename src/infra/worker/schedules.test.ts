import { PgBoss } from 'pg-boss';
import { describe, expect, it } from 'vitest';

/**
 * pg-boss evaluates a cron in the zone it is given, not the host's (vitest runs with TZ=UTC).
 * An unstarted instance answers previewSchedule without a connection when `from` is given.
 */
const boss = new PgBoss({ connectionString: 'postgres://unused@127.0.0.1:9/unused' });
const FROM = new Date('2026-09-30T22:00:00Z'); // 1 October 2026, 00:00 in Prague
const TO = new Date('2027-04-30T22:00:00Z'); // 1 May 2027, 00:00 in Prague

function runs(cron: string): Date[] {
  return boss
    .previewSchedule(cron, { tz: 'Europe/Prague', from: FROM, count: 1000 })
    .filter((run) => run < TO);
}

const pragueDate = (run: Date) => run.toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' });
const perDate = (list: Date[]) => {
  const counts = new Map<string, number>();
  for (const run of list) counts.set(pragueDate(run), (counts.get(pragueDate(run)) ?? 0) + 1);
  return counts;
};

describe('cron in Prague time across both DST Sundays', () => {
  it('fires 10 5 * * * exactly once on every Prague date', () => {
    const list = runs('10 5 * * *');
    expect(list).toHaveLength(212);
    expect([...perDate(list).values()].every((n) => n === 1)).toBe(true);
    expect(list.map((run) => run.toISOString())).toEqual(
      expect.arrayContaining(['2026-10-25T04:10:00.000Z', '2027-03-28T03:10:00.000Z']),
    );
  });

  it('cannot be trusted at hour 2: the preview shows one run on both nights', () => {
    // The timekeeper decides what is due by stepping back from now, and the spike saw 30 2 * * *
    // fire twice on the autumn night (00:30Z and 01:30Z) and not at all on the spring night.
    // The forward preview shows neither, so neither the log nor a reader would see it coming.
    const on = (date: string) =>
      runs('30 2 * * *')
        .filter((run) => pragueDate(run) === date)
        .map((run) => run.toISOString());
    expect(on('2026-10-25')).toEqual(['2026-10-25T00:30:00.000Z']);
    expect(on('2027-03-28')).toEqual(['2027-03-28T01:30:00.000Z']);
  });
});

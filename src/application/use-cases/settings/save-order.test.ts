import { describe, expect, it } from 'vitest';

import { system } from '@/application/ports';
import { deadline, DEFAULT_DEADLINE } from '@/domain/calendar';
import { schoolYear } from '@/domain/cs';
import type { IssueStatus } from '@/domain/review';
import { calDate, type CalDate } from '@/domain/time';

import { setupWorld } from '../../../../test/support/world';
import { saveSettings } from './index';

// The meeting order after a new deadline rule (ADR 0032, ADR 0034). The clock starts on Monday
// 19 October 2026, so a hand-in goes to the 26th and a new rule applies from 2 November.
const world = setupWorld();
const seeder = system('test.seed');

const W3 = calDate(2026, 11, 9);
// Sunday 18.00 for 2 November is 1 November 17.00Z; the porada of the 9th closed before that.
const SUNDAY = { dayOffset: -1, time: '18:00' };
const EARLY_CLOSE = new Date('2026-11-01T10:00:00Z');

const issue = (monday: CalDate, status: IssueStatus, deadlineAt: Date) =>
  world.tx(seeder, async (tx) => {
    const { issue: row } = await tx.issues.ensure({
      monday,
      meetingDate: monday,
      schoolYear: schoolYear(monday),
      deadlineAt,
    });
    return status === 'open' ? row : tx.issues.setStatus(row.id, row.version, status);
  });

const state = () =>
  world.tx(
    seeder,
    async (tx) => ({
      issues: await tx.issues.between(calDate(2026, 10, 1), calDate(2027, 6, 1)),
      setting: await tx.settings.get('deadline'),
      audit: await world.inspect.audit(),
    }),
    'read',
  );

const saveDeadline = async () => {
  const head = await world.seed.user({ role: 'headmaster' });
  return world.run(saveSettings, world.as(head), { key: 'deadline', value: SUNDAY, version: 0 });
};

describe('settings.save, the meeting order after the refreeze', () => {
  it('refuses a rule that puts a porada’s deadline after a generated one that follows, and changes nothing', async () => {
    await issue(W3, 'generated', EARLY_CLOSE);
    const before = await state();
    expect(await saveDeadline()).toEqual({
      ok: false,
      error: { code: 'rule', rule: 'meeting-order' },
    });
    // Rolled back whole: no value stored, no Monday frozen, nothing audited.
    expect(await state()).toEqual(before);
    expect(before.setting).toBeNull();
  });

  it('answers a stale form with conflict, not with an order error for a rule it never saw', async () => {
    await issue(W3, 'generated', EARLY_CLOSE);
    await world.tx(seeder, (tx) =>
      tx.settings.save('deadline', { dayOffset: -2, time: '20:00' }, 0),
    );
    const before = await state();
    // The form was read before the stored row existed: version 0 is stale now.
    expect(await saveDeadline()).toEqual({ ok: false, error: { code: 'conflict' } });
    expect(await state()).toEqual(before);
  });

  it('refuses the same rule for an open porada whose frozen deadline is as early', async () => {
    await issue(W3, 'open', EARLY_CLOSE);
    expect(await saveDeadline()).toEqual({
      ok: false,
      error: { code: 'rule', rule: 'meeting-order' },
    });
    expect((await state()).setting).toBeNull();
  });

  it('takes the rule when the porada after closes later than the new deadline', async () => {
    await issue(W3, 'generated', deadline(W3, DEFAULT_DEADLINE));
    expect(await saveDeadline()).toEqual({ ok: true, value: { version: 1 } });
  });
});

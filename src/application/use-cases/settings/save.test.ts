import { describe, expect, it } from 'vitest';

import { system, type IssueRecord } from '@/application/ports';
import { SETTINGS, toDeadlineRule } from '@/contracts';
import { deadline, DEFAULT_DEADLINE } from '@/domain/calendar';
import { schoolYear } from '@/domain/cs';
import type { IssueStatus } from '@/domain/review';
import { calDate, parseIsoDate, toIsoDate, type CalDate } from '@/domain/time';

import { setupWorld } from '../../../../test/support/world';
import { readWindow } from '../issues';
import { readSettings, saveSettings } from './index';

const world = setupWorld();

const REMINDERS = { soft: false, hard: true };
const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', attrs: { indent: 0 }, content: [{ type: 'text', text }] }],
});

const headmaster = () => world.seed.user({ role: 'headmaster' });
const save = (user: Parameters<typeof world.as>[0], input: unknown) =>
  world.run(saveSettings, world.as(user), input);
const reminders = (version: number, value = REMINDERS) => ({ key: 'reminders', value, version });
const stored = (key: string) => world.tx(system('test.seed'), (tx) => tx.settings.get(key), 'read');

describe('settings.save', () => {
  it('stores the first value at version 1 and shows it to settings.read', async () => {
    const head = await headmaster();
    expect(await save(head, reminders(0))).toEqual({ ok: true, value: { version: 1 } });
    expect(await stored('reminders')).toEqual({ value: REMINDERS, version: 1 });
    const read = await world.run(readSettings, world.as(head), {});
    expect(read.ok && read.value.reminders).toEqual({ value: REMINDERS, version: 1 });
  });

  it('replaces a value at the version it names and gives the next', async () => {
    const head = await headmaster();
    await save(head, reminders(0));
    const next = { soft: true, hard: false };
    expect(await save(head, reminders(1, next))).toEqual({ ok: true, value: { version: 2 } });
    expect(await stored('reminders')).toEqual({ value: next, version: 2 });
  });

  it('stores the annex 1 texts as the schema normalizes them', async () => {
    const head = await headmaster();
    const value = { heading: '  Studenti  ', intro: doc('Text přílohy') };
    expect(await save(head, { key: 'texts.annex1', value, version: 0 })).toEqual({
      ok: true,
      value: { version: 1 },
    });
    expect((await stored('texts.annex1'))?.value).toEqual({
      heading: 'Studenti',
      intro: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { indent: 0 },
            content: [{ type: 'text', text: 'Text přílohy' }],
          },
        ],
      },
    });
  });

  it('refuses a stale version with conflict, changing and auditing nothing', async () => {
    const head = await headmaster();
    await save(head, reminders(0));
    const audit = await world.inspect.audit();
    expect(await save(head, reminders(0, { soft: true, hard: true }))).toEqual({
      ok: false,
      error: { code: 'conflict' },
    });
    await save(head, reminders(1, { soft: true, hard: false }));
    expect(await save(head, reminders(1, { soft: true, hard: true }))).toEqual({
      ok: false,
      error: { code: 'conflict' },
    });
    expect(
      await save(head, {
        key: 'texts.annex1',
        value: SETTINGS['texts.annex1'].default,
        version: 4,
      }),
    ).toEqual({
      ok: false,
      error: { code: 'conflict' },
    });
    expect(await stored('reminders')).toEqual({ value: { soft: true, hard: false }, version: 2 });
    expect(await world.inspect.audit()).toHaveLength(audit.length + 1);
  });

  it('audits the key and nothing the headmaster wrote', async () => {
    const head = await headmaster();
    const before = (await world.inspect.audit()).length;
    await save(head, {
      key: 'texts.annex1',
      value: { heading: 'Tajný nadpis', intro: doc('Tajný text') },
      version: 0,
    });
    const audit = await world.inspect.audit();
    expect(audit).toHaveLength(before + 1);
    const event = audit.at(-1);
    expect(event).toMatchObject({ action: 'settings.saved', actorId: head.id });
    expect(event?.data).toEqual({ meta: { key: 'texts.annex1' } });
    expect(JSON.stringify(event)).not.toContain('Tajný');
  });

  it('refuses everyone but the headmaster, and writes nothing', async () => {
    for (const role of ['pending', 'submitter', 'reviewer'] as const) {
      const user = await world.seed.user({ role });
      expect(await save(user, reminders(0)), role).toEqual({
        ok: false,
        error: { code: 'forbidden' },
      });
    }
    const gone = await world.seed.user({ role: 'headmaster', status: 'deactivated' });
    expect(await save(gone, reminders(0))).toEqual({ ok: false, error: { code: 'forbidden' } });
    expect(await stored('reminders')).toBeNull();
  });

  it.each([
    ['an unknown key', { key: 'texts.annex2', value: {}, version: 0 }],
    [
      'a value of another key',
      { key: 'reminders', value: { heading: 'a', intro: doc('a') }, version: 0 },
    ],
    ['a missing flag', { key: 'reminders', value: { soft: true }, version: 0 }],
    [
      'an empty heading',
      { key: 'texts.annex1', value: { heading: ' ', intro: doc('a') }, version: 0 },
    ],
    ['a negative version', reminders(-1)],
  ])('refuses %s as invalid input and writes nothing', async (_, input) => {
    const head = await headmaster();
    expect(await save(head, input)).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(await stored('reminders')).toBeNull();
    expect(await stored('texts.annex1')).toBeNull();
  });

  describe('the annex 1 texts and the size the table takes', () => {
    /** Empty paragraphs are 42 bytes of JSON each, so 700 stay under the 32 KiB cap and 800 pass it. */
    const annex = (paragraphs: number) => ({
      key: 'texts.annex1',
      value: {
        heading: 'Studenti',
        intro: {
          type: 'doc',
          content: Array.from({ length: paragraphs }, () => ({
            type: 'paragraph',
            attrs: { indent: 0 },
          })),
        },
      },
      version: 0,
    });

    it('takes a long text under the cap', async () => {
      const head = await headmaster();
      expect(await save(head, annex(700))).toEqual({ ok: true, value: { version: 1 } });
    });

    it('refuses a text over the cap as too long on the intro, and writes nothing', async () => {
      const head = await headmaster();
      const audit = await world.inspect.audit();
      expect(await save(head, annex(800))).toEqual({
        ok: false,
        error: { code: 'invalid-input', fields: { 'value.intro': 'too-long' } },
      });
      expect(await stored('texts.annex1')).toBeNull();
      expect(await world.inspect.audit()).toEqual(audit);
    });
  });

  it('cannot run for the system', async () => {
    await expect(world.run(saveSettings, system('cli:test'), reminders(0))).rejects.toThrow(
      'settings.save: runs as a signed-in user',
    );
  });

  describe('the deadline rule (ADR 0032)', () => {
    // The clock starts on Monday 19 October 2026: Saturday's deadline of the 19th has passed, so
    // a hand-in goes to 26 October and a new rule applies from 2 November.
    const SUNDAY = { dayOffset: -1, time: '18:00' };
    const rule = toDeadlineRule(SUNDAY);
    const deadlineRule = (value: unknown, version = 0) => ({ key: 'deadline', value, version });
    const seeder = system('test.seed');
    const issue = (monday: CalDate, status: IssueStatus = 'open', at?: Date) =>
      world.tx(seeder, async (tx) => {
        const { issue: row } = await tx.issues.ensure({
          monday,
          meetingDate: monday,
          schoolYear: schoolYear(monday),
          deadlineAt: at ?? deadline(monday, DEFAULT_DEADLINE),
        });
        return status === 'open' ? row : tx.issues.setStatus(row.id, row.version, status);
      });
    const rows = () =>
      world.tx(
        seeder,
        (tx) => tx.issues.between(calDate(2026, 10, 1), calDate(2027, 6, 1)),
        'read',
      );
    const byMonday = async () =>
      new Map((await rows()).map((row): [string, IssueRecord] => [toIsoDate(row.monday), row]));
    const window = () => world.tx(seeder, (tx) => readWindow(tx, world.clock.now()), 'read');

    it('keeps the deadline people were shown and applies the new rule from the next Monday', async () => {
      const head = await headmaster();
      expect(await save(head, deadlineRule(SUNDAY))).toEqual({ ok: true, value: { version: 1 } });
      const { slots, first } = await window();
      expect(toIsoDate(first)).toBe('2026-10-26');
      const at = (iso: string) => slots.find((slot) => toIsoDate(slot.monday) === iso)?.deadlineAt;
      expect(at('2026-10-26')).toEqual(deadline(calDate(2026, 10, 26), DEFAULT_DEADLINE));
      expect(at('2026-11-02')).toEqual(deadline(calDate(2026, 11, 2), rule));
      expect([...(await byMonday()).keys()]).toEqual(['2026-10-19', '2026-10-26']);
      const event = (await world.inspect.audit()).at(-1);
      expect(event?.data).toMatchObject({ meta: { key: 'deadline', frozen: 2, refrozen: 0 } });
    });

    it('never sends the submit Monday backwards: Thursday to Sunday on a Friday (V3)', async () => {
      await world.seed.setting('deadline', { dayOffset: -4, time: '20:00' });
      world.clock.set(new Date('2026-10-23T10:00:00Z'));
      const head = await headmaster();
      const thursday = toDeadlineRule({ dayOffset: -4, time: '20:00' });
      expect(await save(head, deadlineRule({ dayOffset: -1, time: '20:00' }, 1))).toMatchObject({
        ok: true,
      });
      expect(toIsoDate((await window()).first)).toBe('2026-11-02');
      const stored = await byMonday();
      for (const iso of ['2026-10-26', '2026-11-02']) {
        expect(stored.get(iso)?.deadlineAt, iso).toEqual(deadline(parseIsoDate(iso), thursday));
      }
    });

    it('refreezes open rows after the kept Monday still on the old rule, and nothing else', async () => {
      const kept = await issue(calDate(2026, 10, 26));
      const ahead = await issue(calDate(2026, 11, 2));
      const handSet = await issue(calDate(2026, 11, 9), 'open', new Date('2026-11-06T11:00:00Z'));
      const generated = await issue(calDate(2026, 11, 23), 'generated');
      const head = await headmaster();
      expect(await save(head, deadlineRule(SUNDAY))).toMatchObject({ ok: true });
      const stored = await byMonday();
      expect(stored.get('2026-11-02')).toEqual({
        ...ahead,
        deadlineAt: deadline(calDate(2026, 11, 2), rule),
        version: 2,
      });
      for (const row of [kept, handSet, generated]) {
        expect(stored.get(toIsoDate(row.monday))).toEqual(row);
      }
      const event = (await world.inspect.audit()).at(-1);
      expect(event?.data).toMatchObject({ meta: { key: 'deadline', frozen: 1, refrozen: 1 } });
    });

    it('only saves a rule that is the one in force', async () => {
      const head = await headmaster();
      const same = { dayOffset: -2, time: '20:00' };
      expect(await save(head, deadlineRule(same))).toEqual({ ok: true, value: { version: 1 } });
      expect(await rows()).toEqual([]);
    });

    it('refuses a stale version with conflict and freezes nothing', async () => {
      await issue(calDate(2026, 11, 2));
      const before = await rows();
      const audit = await world.inspect.audit();
      const head = await headmaster();
      expect(await save(head, deadlineRule(SUNDAY, 3))).toEqual({
        ok: false,
        error: { code: 'conflict' },
      });
      expect(await rows()).toEqual(before);
      expect(await stored('deadline')).toBeNull();
      expect(await world.inspect.audit()).toHaveLength(audit.length);
    });

    it.each([
      ['the meeting day', { dayOffset: 0, time: '20:00' }],
      ['five days before', { dayOffset: -5, time: '20:00' }],
      ['07.45', { dayOffset: -2, time: '07:45' }],
      ['20.10', { dayOffset: -2, time: '20:10' }],
    ])('refuses %s as invalid input', async (_, value) => {
      const head = await headmaster();
      expect(await save(head, deadlineRule(value))).toMatchObject({
        ok: false,
        error: { code: 'invalid-input' },
      });
      expect(await stored('deadline')).toBeNull();
      expect(await rows()).toEqual([]);
    });
  });
});

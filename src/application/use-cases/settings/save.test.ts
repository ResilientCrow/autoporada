import { describe, expect, it } from 'vitest';

import { system } from '@/application/ports';
import { SETTINGS } from '@/contracts';

import { setupWorld } from '../../../../test/support/world';
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
});

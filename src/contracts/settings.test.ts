import { describe, expect, it } from 'vitest';

import { DEFAULT_DEADLINE } from '@/domain/calendar';
import { ANNEX1_MAX_BYTES, richDocToPlainText } from '@/domain/richtext';
import { parseWallTime, toIsoTime } from '@/domain/time';

import { snapshotFixture } from '../../test/support/snapshots';

import {
  SETTINGS,
  settingsReadInput,
  settingsReadOutput,
  settingsSaveInput,
  settingsSaveOutput,
  toDeadlineRule,
  toDeadlineWire,
  type SettingKey,
} from './settings';

const KEYS = Object.keys(SETTINGS) as SettingKey[];

describe('SETTINGS', () => {
  it('holds the deadline, the reminders and the annex 1 texts', () => {
    expect(KEYS.sort()).toEqual(['deadline', 'reminders', 'texts.annex1']);
  });

  it.each(KEYS)('names %s so the settings_key CHECK accepts it', (key) => {
    expect(key).toMatch(/^[a-z0-9.]{1,64}$/);
  });

  it.each(KEYS)('has a default that its own schema reads back unchanged (%s)', (key) => {
    const { schema, default: value } = SETTINGS[key];
    expect(schema.parse(JSON.parse(JSON.stringify(value)))).toEqual(value);
  });

  it('defaults the deadline to the rule the code already uses, so nothing changes', () => {
    expect(SETTINGS.deadline.default).toEqual({
      dayOffset: DEFAULT_DEADLINE.dayOffset,
      time: toIsoTime(DEFAULT_DEADLINE.time),
    });
    expect(SETTINGS.deadline.default).toEqual({ dayOffset: -2, time: '20:00' });
  });

  it('defaults both reminders on and the annex 1 text to the template’s', () => {
    expect(SETTINGS.reminders.default).toEqual({ soft: true, hard: true });
    expect(SETTINGS['texts.annex1'].default.heading).toMatch(/^Studenti v ředitelském/);
    expect(richDocToPlainText(SETTINGS['texts.annex1'].default.intro)).toContain('{skolniRok}');
    expect(SETTINGS['texts.annex1'].default).toEqual(snapshotFixture('template-replica').annex1);
  });
});

describe('the deadline rule on the wire', () => {
  it('reads the default of the registry as the rule the code already uses', () => {
    expect(toDeadlineRule(SETTINGS.deadline.default)).toEqual(DEFAULT_DEADLINE);
  });

  it('reads a time as a wall time, quarter hours and a late evening included', () => {
    expect(toDeadlineRule({ dayOffset: -3, time: '12:00' })).toEqual({
      dayOffset: -3,
      time: parseWallTime('12:00'),
    });
    expect(toDeadlineRule({ dayOffset: -1, time: '21:45' }).time).toEqual(parseWallTime('21:45'));
  });

  it('writes a rule back as the text the form and the table carry', () => {
    const rule = { dayOffset: -4, time: parseWallTime('08:15') };
    expect(toDeadlineWire(rule)).toEqual({ dayOffset: -4, time: '08:15' });
    expect(toDeadlineRule(toDeadlineWire(rule))).toEqual(rule);
    expect(SETTINGS.deadline.schema.parse(toDeadlineWire(rule))).toEqual(toDeadlineWire(rule));
  });
});

describe('the deadline schema', () => {
  const parse = (value: unknown) => SETTINGS.deadline.schema.safeParse(value).success;

  it.each([
    [-4, '08:00'],
    [-1, '22:00'],
    [-2, '20:00'],
    [-3, '13:45'],
    [-2, '09:15'],
  ])('accepts %s days at %s', (dayOffset, time) => {
    expect(parse({ dayOffset, time })).toBe(true);
  });

  it.each([
    ['no days before', { dayOffset: 0, time: '20:00' }],
    ['a day after the meeting', { dayOffset: 1, time: '20:00' }],
    ['more than four days before', { dayOffset: -5, time: '20:00' }],
    ['a fractional day', { dayOffset: -1.5, time: '20:00' }],
    ['a day as text', { dayOffset: '-2', time: '20:00' }],
    ['before 8.00', { dayOffset: -2, time: '07:45' }],
    ['after 22.00', { dayOffset: -2, time: '22:15' }],
    ['off the quarter hour', { dayOffset: -2, time: '20:10' }],
    ['no leading zero', { dayOffset: -2, time: '9:00' }],
    ['a time with seconds', { dayOffset: -2, time: '20:00:00' }],
    ['a time object', { dayOffset: -2, time: { hour: 20, minute: 0 } }],
    ['a missing time', { dayOffset: -2 }],
    ['an extra key', { dayOffset: -2, time: '20:00', day: 'sat' }],
    ['null', null],
  ])('refuses %s', (_, value) => {
    expect(parse(value)).toBe(false);
  });
});

describe('the reminders schema', () => {
  const parse = (value: unknown) => SETTINGS.reminders.schema.safeParse(value).success;

  it('takes both flags in either state', () => {
    expect(parse({ soft: false, hard: true })).toBe(true);
    expect(parse({ soft: false, hard: false })).toBe(true);
  });

  it.each([
    { soft: true },
    { soft: 'yes', hard: true },
    { soft: true, hard: true, late: true },
    [],
  ])('refuses %j', (value) => {
    expect(parse(value)).toBe(false);
  });
});

describe('the annex 1 schema', () => {
  const doc = (text: string) => ({
    type: 'doc',
    content: [{ type: 'paragraph', attrs: { indent: 0 }, content: [{ type: 'text', text }] }],
  });
  const parse = (value: unknown) => SETTINGS['texts.annex1'].schema.safeParse(value);

  it('takes a heading and a paragraphs document', () => {
    const parsed = parse({ heading: ' Studenti ', intro: doc('Text') });
    expect(parsed.success && parsed.data.heading).toBe('Studenti');
  });

  it.each([
    ['an empty heading', { heading: '  ', intro: doc('a') }],
    ['a heading over 300 characters', { heading: 'x'.repeat(301), intro: doc('a') }],
    ['a heading with a direction mark', { heading: 'a\u202Eb', intro: doc('a') }],
    ['a bullet level the profile does not allow', { heading: 'a', intro: bullet() }],
    ['an intro that is no document', { heading: 'a', intro: 'text' }],
    ['a missing intro', { heading: 'a' }],
    ['an extra key', { heading: 'a', intro: doc('a'), outro: doc('b') }],
  ])('refuses %s', (_, value) => {
    expect(parse(value).success).toBe(false);
  });

  function bullet() {
    return {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { indent: 2 }, content: [{ type: 'text', text: 'a' }] },
      ],
    };
  }
});

describe('the read wire', () => {
  it('takes no input', () => {
    expect(settingsReadInput.safeParse({}).success).toBe(true);
    expect(settingsReadInput.safeParse({ key: 'deadline' }).success).toBe(false);
  });

  it('answers every key with its value and version, and nothing else', () => {
    const entries = Object.fromEntries(
      KEYS.map((key) => [key, { value: SETTINGS[key].default, version: 0 }]),
    );
    expect(settingsReadOutput.safeParse(entries).success).toBe(true);
    expect(settingsReadOutput.safeParse({ ...entries, extra: entries['deadline'] }).success).toBe(
      false,
    );
    const { reminders: _dropped, ...partial } = entries;
    expect(settingsReadOutput.safeParse(partial).success).toBe(false);
  });
});

describe('the save wire', () => {
  const doc = (text: string) => ({
    type: 'doc',
    content: [{ type: 'paragraph', attrs: { indent: 0 }, content: [{ type: 'text', text }] }],
  });
  const parse = (input: unknown) => settingsSaveInput.safeParse(input);

  it('takes every key, each with its own value and a version', () => {
    expect(
      parse({ key: 'deadline', value: { dayOffset: -1, time: '18:00' }, version: 2 }).success,
    ).toBe(true);
    expect(
      parse({ key: 'reminders', value: { soft: false, hard: true }, version: 0 }).success,
    ).toBe(true);
    // The value is checked here and normalized by the use case (save.test.ts).
    expect(
      parse({
        key: 'texts.annex1',
        value: { heading: ' Studenti ', intro: doc('Text') },
        version: 3,
      }).success,
    ).toBe(true);
  });

  it.each([
    [
      'another key’s value',
      { key: 'reminders', value: { heading: 'a', intro: doc('a') }, version: 0 },
    ],
    [
      'a value that breaks its schema',
      { key: 'texts.annex1', value: { heading: '', intro: doc('a') }, version: 0 },
    ],
    [
      'a deadline on the meeting day',
      { key: 'deadline', value: { dayOffset: 0, time: '20:00' }, version: 0 },
    ],
    [
      'a deadline under another key',
      { key: 'reminders', value: { dayOffset: -2, time: '20:00' }, version: 0 },
    ],
    ['an unknown key', { key: 'texts.annex2', value: {}, version: 0 }],
    ['a negative version', { key: 'reminders', value: { soft: true, hard: true }, version: -1 }],
    ['a fractional version', { key: 'reminders', value: { soft: true, hard: true }, version: 1.5 }],
    ['a missing version', { key: 'reminders', value: { soft: true, hard: true } }],
    ['an extra key', { key: 'reminders', value: { soft: true, hard: true }, version: 0, on: 1 }],
  ])('refuses %s', (_, input) => {
    expect(parse(input).success).toBe(false);
  });

  it('keeps the largest annex 1 text the schema takes well under the table’s 64 KiB, as jsonb prints it', () => {
    // jsonb adds a space after each ":" and ",": at most one byte in three for the shortest
    // members, so a stored text that fits the cap prints well inside settings_size.
    const heading = '€'.repeat(300);
    let content: unknown[] = [];
    for (;;) {
      const next = [...content, { type: 'paragraph', attrs: { indent: 0 } }];
      if (
        !SETTINGS['texts.annex1'].schema.safeParse({
          heading,
          intro: { type: 'doc', content: next },
        }).success
      )
        break;
      content = next;
    }
    const largest = SETTINGS['texts.annex1'].schema.parse({
      heading,
      intro: { type: 'doc', content },
    });
    const printed = JSON.stringify(largest).replaceAll(':', ': ').replaceAll(',', ', ');
    // jsonb adds at most half again to the printed JSON, so the cap leaves room under settings_size.
    expect(ANNEX1_MAX_BYTES * 1.5).toBeLessThanOrEqual(64 * 1024);
    expect(content.length).toBeGreaterThan(100);
    expect(Buffer.byteLength(printed)).toBeLessThan(60_000);
  });

  it('answers with the version the row has now', () => {
    expect(settingsSaveOutput.safeParse({ version: 2 }).success).toBe(true);
    expect(settingsSaveOutput.safeParse({ version: 0 }).success).toBe(false);
    expect(settingsSaveOutput.safeParse({ version: 2, saved: true }).success).toBe(false);
  });
});

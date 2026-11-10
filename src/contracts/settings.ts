import { z } from 'zod';

import { DEFAULT_DEADLINE, type DeadlineRule } from '@/domain/calendar';
import {
  ANNEX1_MAX_BYTES,
  hasForbiddenCharacters,
  parseRichDoc,
  richDocFromText,
  type RichDoc,
} from '@/domain/richtext';
import { parseWallTime, toIsoTime } from '@/domain/time';

import { richDocWire } from './point';

/** A time on a quarter hour between 08.00 and 22.00, as the form sends it and the table stores it. */
const deadlineTime = z
  .string()
  .max(5)
  .regex(/^([01]\d|2[0-3]):(00|15|30|45)$/)
  .refine((time) => time >= '08:00' && time <= '22:00');

/** `DeadlineRule` on the wire: days from the meeting date (-2 = the Saturday before a Monday) and the time. */
export const deadlineSchema = z.strictObject({
  dayOffset: z.int().min(-4).max(-1),
  time: deadlineTime,
});

/** The deadline rule as the table, the form and `issues.window` carry it. */
export type DeadlineWire = z.output<typeof deadlineSchema>;

/** The rule the calendar domain computes with, from its wire shape (the one place "HH:MM" becomes a wall time). */
export const toDeadlineRule = ({ dayOffset, time }: DeadlineWire): DeadlineRule => ({
  dayOffset,
  time: parseWallTime(time),
});

/** The wire shape of a rule, the inverse of `toDeadlineRule`. */
export const toDeadlineWire = ({ dayOffset, time }: DeadlineRule): DeadlineWire => ({
  dayOffset,
  time: toIsoTime(time),
});

/**
 * Where the implied poradas start (ADR 0054 item 1): null, or the Monday of a stored porada. Up to
 * the later of it and last week's Monday the calendar is exactly its rows. Written only by
 * `issues.drop`; no save takes it and the settings page does not show it.
 */
const calendarSchema = z.strictObject({ plannedThrough: z.iso.date().nullable() });

const remindersSchema = z.strictObject({ soft: z.boolean(), hard: z.boolean() });

const annexHeading = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .refine((text) => !hasForbiddenCharacters(text, { allowTab: false }));

const annexIntro = richDocWire.transform((value, ctx): RichDoc => {
  const parsed = parseRichDoc(value, 'paragraphs');
  if (parsed.ok) return parsed.doc;
  for (const message of parsed.errors) ctx.addIssue({ code: 'custom', message });
  return z.NEVER;
});

/** The heading and paragraphs above the list of annex 1, before the size check. */
const annex1Shape = z.strictObject({ heading: annexHeading, intro: annexIntro });

/** The text above the list of annex 1, small enough for the table (the cap is on its printed JSON). */
const annex1Schema = annex1Shape.superRefine((value, ctx) => {
  if (new TextEncoder().encode(JSON.stringify(value)).length > ANNEX1_MAX_BYTES) {
    ctx.addIssue({ code: 'custom', path: ['intro'], params: { code: 'too-long' } });
  }
});

/** What each key holds once read. Writes are validated, so a stored value that is not this is corruption. */
export interface SettingValues {
  readonly deadline: DeadlineWire;
  readonly reminders: z.output<typeof remindersSchema>;
  readonly calendar: z.output<typeof calendarSchema>;
  readonly 'texts.annex1': z.output<typeof annex1Schema>;
}
export type SettingKey = keyof SettingValues;

interface Setting<T> {
  readonly schema: z.ZodType<T>;
  /** What a missing row means: the behavior the code had before the setting existed. */
  readonly default: T;
}

/** The template's text above annex 1; `{skolniRok}` is filled in when the document is made. */
const ANNEX1_DEFAULT: SettingValues['texts.annex1'] = {
  heading: 'Studenti v ředitelském „Programu na podporu talentovaným a aktivním studentům“',
  intro: richDocFromText(
    [
      'Níže uvedení studenti byli zařazeni ředitelem školy do „Programu na podporu talentovaných a aktivních studentů“. Na níže uvedené studenty se nevztahuje pravidlo 75% docházky do výuky, studenti jsou však povinni aktivně a průběžně komunikovat s učiteli, učitelé jsou povinni jim vyjít vstříc při žádosti o domluvu na přezkoušení či dopsání testu.',
      'Pokud někdo ze studentů má zájem být do programu zařazen, musí v novém školním roce {skolniRok} opět o toto požádat ředitele školy. V případě nezletilých studentů tak musí učinit jejich rodiče.',
      'Tučně označení jsou vždy studenti, kteří byli do programu na podporu talentovaným a aktivním studentům zařazeni v průběhu předchozího týdne a jsou nyní uvedeni do této přílohy číslo 1 v rámci porady vedení.',
    ].join('\n'),
  ),
};

/**
 * Every setting, by the key of the `settings` table (`^[a-z0-9.]{1,64}$`): the schema a stored
 * value must satisfy and the default a missing row stands for (ADR 0032).
 */
export const SETTINGS: { readonly [K in SettingKey]: Setting<SettingValues[K]> } = {
  deadline: {
    schema: deadlineSchema,
    default: toDeadlineWire(DEFAULT_DEADLINE),
  },
  reminders: { schema: remindersSchema, default: { soft: true, hard: true } },
  calendar: { schema: calendarSchema, default: { plannedThrough: null } },
  'texts.annex1': { schema: annex1Schema, default: ANNEX1_DEFAULT },
};

export const settingsReadInput = z.strictObject({});

/** A key's value and the version a save must name; 0 means no row is stored and the default applies. */
const entry = <S extends z.ZodType>(value: S) => z.strictObject({ value, version: z.int().min(0) });

/** Every setting as the form shows it. */
export const settingsReadOutput = z.strictObject({
  deadline: entry(deadlineSchema),
  reminders: entry(remindersSchema),
  'texts.annex1': entry(z.strictObject({ heading: annexHeading, intro: richDocWire })),
});

/** A version of 0 names a key that has no row yet; any other is the version the form read. */
const version = z.int().min(0);

/** The keys a save takes: every one. */
const SAVABLE = ['deadline', 'reminders', 'texts.annex1'] as const satisfies readonly SettingKey[];

/**
 * One setting and the version it was read at. A use case's input is one strict object, so the
 * value is either key's shape, normalized, and a check holds it to the schema of the key it came
 * with: its issues (an oversize intro as `value.intro`) keep their own paths.
 */
export const settingsSaveInput = z
  .strictObject({
    key: z.enum(SAVABLE),
    value: z.union([deadlineSchema, remindersSchema, annex1Shape]),
    version,
  })
  .superRefine(({ key, value }, ctx) => {
    const parsed = SETTINGS[key].schema.safeParse(value);
    if (parsed.success) return;
    for (const issue of parsed.error.issues) {
      ctx.addIssue({ ...issue, path: ['value', ...issue.path] });
    }
  });

/** The version the row has after the save. */
export const settingsSaveOutput = z.strictObject({ version: z.int().min(1) });

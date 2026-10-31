import { z } from 'zod';

import { DEFAULT_DEADLINE } from '@/domain/calendar';
import {
  hasForbiddenCharacters,
  parseRichDoc,
  richDocFromText,
  type RichDoc,
} from '@/domain/richtext';
import { toIsoTime } from '@/domain/time';

import { richDocWire } from './point';

/** A time on a quarter hour between 08.00 and 22.00, as the form sends it and the table stores it. */
const deadlineTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):(00|15|30|45)$/)
  .refine((time) => time >= '08:00' && time <= '22:00');

/** `DeadlineRule` on the wire: days from the meeting date (-2 = the Saturday before a Monday) and the time. */
const deadlineSchema = z.strictObject({
  dayOffset: z.int().min(-4).max(-1),
  time: deadlineTime,
});

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

/** The text above the list of annex 1: a heading and paragraphs. */
const annex1Schema = z.strictObject({ heading: annexHeading, intro: annexIntro });

/** What each key holds once read. Writes are validated, so a stored value that is not this is corruption. */
export interface SettingValues {
  readonly deadline: z.output<typeof deadlineSchema>;
  readonly reminders: z.output<typeof remindersSchema>;
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
    default: { dayOffset: DEFAULT_DEADLINE.dayOffset, time: toIsoTime(DEFAULT_DEADLINE.time) },
  },
  reminders: { schema: remindersSchema, default: { soft: true, hard: true } },
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

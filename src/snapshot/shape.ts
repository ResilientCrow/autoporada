import { z } from 'zod';

import { hasForbiddenCharacters, parseRichDoc, type RichProfile } from '@/domain/richtext';
import { parseIsoDate, parseWallTime } from '@/domain/time';

import { checkDates, checkIssueWeek, checkItems, checkRegistry } from './checks';

/**
 * The parts of an IssueSnapshot that schema 1 and schema 2 share; only the future item differs
 * (ADR 0060). Every object is strict, and a change to the shape means a new `schema` number with
 * an upcaster from the old one.
 */

const isoDate = z.string().refine((s) => {
  try {
    parseIsoDate(s);
    return true;
  } catch {
    return false;
  }
}, 'must be a calendar date YYYY-MM-DD');

const wallTime = z.string().refine((s) => {
  try {
    parseWallTime(s);
    return true;
  } catch {
    return false;
  }
}, 'must be a time H:MM');

/** Plain fields are single-line and bounded; rich text has its own 64 KB limit. */
const MAX_TEXT = 10_000;
const MAX_TITLE = 300;
export const text = z
  .string()
  .trim()
  .max(MAX_TEXT)
  .refine(
    (s) => !hasForbiddenCharacters(s, { allowTab: false }),
    'contains control or direction characters',
  );
export const required = text.refine((s) => s.length > 0, 'must not be empty');
export const title = required.refine(
  (s) => s.length <= MAX_TITLE,
  `must be at most ${MAX_TITLE} characters`,
);

const richDoc = (profile: RichProfile) =>
  z.unknown().transform((value, ctx) => {
    const result = parseRichDoc(value, profile);
    if (result.ok) return result.doc;
    for (const message of result.errors) ctx.addIssue({ code: 'custom', message });
    return z.NEVER;
  });

const salutation = z.enum(['pan', 'pani', 'slecna']);

export const person = z.strictObject({
  salutation,
  titlesBefore: text.optional(),
  givenName: text,
  familyName: required,
  titlesAfter: text.optional(),
  affiliation: text.optional(),
});

/** „vyjádření pana Johna Doe (1.A): „…““ — the speaker is stored in the 2nd case. */
const statement = z.strictObject({
  speakerGenitive: required,
  affiliation: text.optional(),
  quote: required,
});

const slot = z.enum(['meetings', 'events', 'talent', 'exemptions', 'media', 'partners']);

const item = z.strictObject({
  title,
  slot: slot.nullable(),
  body: richDoc('outline'),
  /** Only for the „partners“ slot: „o vyjádření pana …: „…““. */
  quotes: z.array(statement).default([]),
});

const bullet = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('people'),
    label: required,
    order: z.enum(['input', 'class-surname']),
    people: z.array(person).min(1),
  }),
  z.strictObject({ kind: z.literal('text'), label: required, text: required }),
]);

export const dated = {
  date: isoDate,
  endDate: isoDate.optional(),
  timeFrom: wallTime.optional(),
  timeTo: wallTime.optional(),
};

const report = z.strictObject({
  id: required,
  title,
  ...dated,
  body: richDoc('paragraphs'),
  bullets: z.array(bullet),
  statements: z.array(statement),
  /** A placeholder for a report nobody delivered (ADR 0049): the document says so in two fixed lines. */
  missing: z.literal(true).optional(),
});

export const campus = z.enum(['smichov', 'radlice', 'na-vidouli', 'jinde']);

const registryList = z.strictObject({
  key: required,
  purpose: z.enum(['annex1', 'point4']),
  /** Point 4: „seznam studentů uvolněných z Anglického jazyka na základě získaných certifikátů“ */
  docLabel: title,
  entries: z.array(
    z.strictObject({
      givenName: text,
      familyName: required,
      classCode: required,
      isNew: z.boolean(),
    }),
  ),
});

/** One further annex of a porada, as text, tables and pictures. */
export const issueAnnexSchema = z.strictObject({
  title: text,
  parts: z.array(
    z.union([
      z.strictObject({ kind: z.literal('text'), doc: richDoc('outline') }),
      z.strictObject({ kind: z.literal('table'), rows: z.array(z.array(z.string())) }),
      z.strictObject({
        kind: z.literal('image'),
        src: z.string(),
        w: z.number(),
        h: z.number(),
        alt: z.string(),
      }),
    ]),
  ),
});

/** Every field of a snapshot but `schema`, around the version's own `futureItem`. */
export function snapshotFields<F extends z.ZodType>(futureItem: F) {
  return {
    issue: z.strictObject({
      id: required,
      /** The Monday of the issue's slot, its key. */
      monday: isoDate,
      /** The day the meeting happens (it can move off the Monday); title, closing, agenda windows and ended-before. */
      meetingDate: isoDate,
      schoolYear: z.string().regex(/^\d{4}\/\d{4}$/, 'must be like 2026/2027'),
    }),
    presentText: text,
    guestsText: text,
    pokyny: z.array(item),
    hospodareni: z.array(item),
    reports: z.array(report),
    futureItems: z.array(futureItem),
    registry: z.array(registryList),
    annex1: z.strictObject({ heading: title, intro: richDoc('paragraphs') }),
    annex2: richDoc('outline').nullable(),
    annexes: z.array(issueAnnexSchema).default([]),
    options: z.strictObject({ groupOrder: z.array(salutation).optional() }).default({}),
  };
}

/** The cross-field checks of a snapshot, the same for every schema. */
export function refineSnapshot(
  s: {
    readonly issue: { readonly monday: string; readonly schoolYear: string };
    readonly reports: Parameters<typeof checkDates>[1];
    readonly futureItems: Parameters<typeof checkDates>[1];
    readonly pokyny: Parameters<typeof checkItems>[0];
    readonly hospodareni: Parameters<typeof checkItems>[1];
    readonly registry: Parameters<typeof checkRegistry>[0];
  },
  ctx: Parameters<typeof checkIssueWeek>[1],
): void {
  checkIssueWeek(s.issue, ctx);
  checkDates('reports', s.reports, ctx);
  checkDates('futureItems', s.futureItems, ctx);
  checkItems(s.pokyny, s.hospodareni, ctx);
  checkRegistry(s.registry, ctx);
}

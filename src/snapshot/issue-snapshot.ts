import { z } from 'zod';

import { hasForbiddenCharacters, parseRichDoc, type RichProfile } from '@/domain/richtext';
import { parseIsoDate, parseWallTime } from '@/domain/time';

import { checkDates, checkIssueWeek, checkItems, checkRegistry } from './checks';

/**
 * IssueSnapshot v1: everything the document engine needs to render one issue,
 * and nothing else. It is stored with every generated version, so it must
 * stay readable forever: every object is strict, and a change to its shape
 * means a new `schema` number with an upcaster from the old one.
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
const text = z
  .string()
  .trim()
  .max(MAX_TEXT)
  .refine(
    (s) => !hasForbiddenCharacters(s, { allowTab: false }),
    'contains control or direction characters',
  );
const required = text.refine((s) => s.length > 0, 'must not be empty');
const title = required.refine(
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

const person = z.strictObject({
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

const dated = {
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

const campus = z.enum(['smichov', 'radlice', 'na-vidouli', 'jinde']);

const futureItem = z.strictObject({
  id: required,
  kind: z.enum(['jednani', 'akce']),
  title,
  ...dated,
  campus: campus.optional(),
  place: text.optional(),
  /** „za Next Zone Event Space koordinuje absolvent pan Jan Novák“ */
  responsible: z
    .strictObject({
      verb: z.enum(['organizuje', 'koordinuje', 'zajišťuje', 'vede']),
      /** „za …“: the organisation the people act for. */
      behalfOf: title.optional(),
      people: z.array(person.extend({ role: text.optional() })).min(1),
    })
    .optional(),
});

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

export const issueSnapshotSchema = z
  .strictObject({
    schema: z.literal(1),
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
    options: z.strictObject({ groupOrder: z.array(salutation).optional() }).default({}),
  })
  .superRefine((s, ctx) => {
    checkIssueWeek(s.issue, ctx);
    checkDates('reports', s.reports, ctx);
    checkDates('futureItems', s.futureItems, ctx);
    checkItems(s.pokyny, s.hospodareni, ctx);
    checkRegistry(s.registry, ctx);
  });

export type IssueSnapshot = z.output<typeof issueSnapshotSchema>;
export type SnapshotItem = IssueSnapshot['pokyny'][number];
export type SnapshotReport = IssueSnapshot['reports'][number];
export type SnapshotFutureItem = IssueSnapshot['futureItems'][number];
export type SnapshotRegistryList = IssueSnapshot['registry'][number];
export type SnapshotStatement = SnapshotReport['statements'][number];
export type SnapshotBullet = SnapshotReport['bullets'][number];

export const SNAPSHOT_SCHEMA_VERSION = 1;

export type SnapshotResult =
  | { readonly ok: true; readonly snapshot: IssueSnapshot }
  | { readonly ok: false; readonly errors: readonly string[] };

/** Validates untrusted (stored or assembled) snapshot data. */
export function parseIssueSnapshot(input: unknown): SnapshotResult {
  const parsed = issueSnapshotSchema.safeParse(input);
  if (parsed.success) return { ok: true, snapshot: parsed.data };
  return {
    ok: false,
    errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
  };
}

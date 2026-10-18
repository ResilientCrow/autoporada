import { z } from 'zod';

import { assertMonday } from '@/domain/calendar';
import { parseRichDoc, type RichProfile } from '@/domain/richtext';
import { addDays, compareDates, parseIsoDate, parseWallTime } from '@/domain/time';

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

/** Single-line text: XML 1.0 cannot carry control characters, and no field here spans lines. */
const UNSAFE =
  /[\u0000-\u001F\u007F-\u009F\u2028\u2029\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const text = z
  .string()
  .trim()
  .refine((s) => !UNSAFE.test(s), 'contains control characters');
const required = text.refine((s) => s.length > 0, 'must not be empty');

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
  title: text,
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
  title: required,
  ...dated,
  body: richDoc('paragraphs'),
  bullets: z.array(bullet),
  statements: z.array(statement),
});

const campus = z.enum(['smichov', 'radlice', 'na-vidouli', 'jinde']);

const futureItem = z.strictObject({
  id: required,
  kind: z.enum(['jednani', 'akce']),
  title: required,
  ...dated,
  campus: campus.optional(),
  place: text.optional(),
});

const registryList = z.strictObject({
  key: required,
  purpose: z.enum(['annex1', 'point4']),
  /** Point 4: „seznam studentů uvolněných z Anglického jazyka na základě získaných certifikátů“ */
  docLabel: required,
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
      /** The Monday the issue belongs to; drives the agenda windows. */
      monday: isoDate,
      /** The day the meeting actually happens (a holiday can move it); title and closing. */
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
    annex1: z.strictObject({ heading: required, intro: richDoc('paragraphs') }),
    annex2: richDoc('outline').nullable(),
    options: z.strictObject({ groupOrder: z.array(salutation).optional() }).default({}),
  })
  .superRefine((s, ctx) => {
    const monday = parseIsoDate(s.issue.monday);
    try {
      assertMonday(monday);
    } catch {
      ctx.addIssue({ code: 'custom', path: ['issue', 'monday'], message: 'must be a Monday' });
      return;
    }
    const meeting = parseIsoDate(s.issue.meetingDate);
    if (compareDates(meeting, monday) < 0 || compareDates(meeting, addDays(monday, 6)) > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['issue', 'meetingDate'],
        message: 'must be in the week of the Monday',
      });
    }
    for (const [list, entries] of [
      ['reports', s.reports],
      ['futureItems', s.futureItems],
    ] as const) {
      entries.forEach((r, i) => {
        if (r.endDate && compareDates(parseIsoDate(r.endDate), parseIsoDate(r.date)) < 0) {
          ctx.addIssue({
            code: 'custom',
            path: [list, i, 'endDate'],
            message: 'ends before it starts',
          });
        }
      });
    }
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

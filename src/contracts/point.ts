import { z } from 'zod';

import type { Campus, Salutation } from '@/domain/cs';
import {
  contentBytes,
  POINT_LIMITS,
  type PointKind,
  type DraftBullet,
  type DraftPerson,
  type DraftStatement,
  type PointContent,
  type PointFieldValues,
} from '@/domain/report';
import { POINT_MACHINE, REVIEW_DECISIONS } from '@/domain/review';
import {
  LIMITS as RICH_LIMITS,
  parseRichDoc,
  type RichParagraph,
  type RichText,
} from '@/domain/richtext';
import {
  compareDates,
  parseIsoDate,
  parseWallTime,
  toIsoDate,
  toIsoTime,
  type CalDate,
  type WallTime,
} from '@/domain/time';

import { bulletKeySchema, uniqueKeys } from './point-type';

/**
 * The jsonb parts of a point, as stored and as the editor sends them. A draft
 * may be unfinished, so only the bounds and the shape are checked here;
 * readiness asks for names, salutations and quotes at submit.
 */
const capped = (max: number) => z.string().max(max);
const { person: PERSON } = POINT_LIMITS;

const salutationSchema = z.enum(['pan', 'pani', 'slecna']) satisfies z.ZodType<Salutation>;

export const draftPersonSchema = z.strictObject({
  graphId: capped(POINT_LIMITS.graphId).optional(),
  salutation: salutationSchema.nullable(),
  titlesBefore: capped(PERSON.title).optional(),
  givenName: capped(PERSON.name),
  familyName: capped(PERSON.name),
  titlesAfter: capped(PERSON.title).optional(),
  affiliation: capped(PERSON.affiliation).optional(),
  affiliationYear: capped(POINT_LIMITS.affiliationYear).optional(),
}) satisfies z.ZodType<DraftPerson>;

const bulletBase = { key: bulletKeySchema, label: capped(POINT_LIMITS.bulletLabel) };

const draftBulletSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...bulletBase,
    kind: z.literal('people'),
    order: z.enum(['input', 'class-surname']),
    people: z.array(draftPersonSchema).max(POINT_LIMITS.peoplePerBullet),
  }),
  z.strictObject({ ...bulletBase, kind: z.literal('text'), text: capped(POINT_LIMITS.textBullet) }),
]) satisfies z.ZodType<DraftBullet>;

const peopleIn = (bullets: readonly DraftBullet[]) =>
  bullets.reduce((sum, b) => sum + (b.kind === 'people' ? b.people.length : 0), 0);

/** `points.bullets`: at most 12, keys unique, at most 400 people in all. */
export const draftBulletsSchema = z
  .array(draftBulletSchema)
  .max(POINT_LIMITS.bullets)
  .refine(uniqueKeys, { message: 'duplicate-key' })
  .refine((bullets) => peopleIn(bullets) <= POINT_LIMITS.peoplePerPoint, {
    message: 'too-many-people',
  });

const draftStatementSchema = z.strictObject({
  speaker: draftPersonSchema.nullable(),
  speakerGenitive: capped(POINT_LIMITS.speakerGenitive),
  affiliation: capped(POINT_LIMITS.statementAffiliation).optional(),
  quote: capped(POINT_LIMITS.quote),
}) satisfies z.ZodType<DraftStatement>;

/** `points.statements`: at most 10. */
export const draftStatementsSchema = z.array(draftStatementSchema).max(POINT_LIMITS.statements);

/** The jsonb columns of a point. */
export type PointJsonb = Pick<PointContent, 'body' | 'bullets' | 'statements'>;

/**
 * The one parse of a point's jsonb, as stored and before every write; null
 * when the contract refuses any part. The body is checked against the widest
 * rich text profile; which profile a kind may use is the input contract's rule.
 */
export function parsePointJsonb(value: { [K in keyof PointJsonb]: unknown }): PointJsonb | null {
  const body = parseRichDoc(value.body, 'outline');
  const people = parsePointPeople(value);
  if (!body.ok || !people) return null;
  return { body: body.doc, ...people };
}

/** The jsonb columns that name people: what the people memory reads, without the body. */
type PointPeopleJsonb = Pick<PointContent, 'bullets' | 'statements'>;

/** The one parse of a point's bullets and statements; null when the contract refuses either. */
export function parsePointPeople(value: {
  [K in keyof PointPeopleJsonb]: unknown;
}): PointPeopleJsonb | null {
  const bullets = draftBulletsSchema.safeParse(value.bullets);
  const statements = draftStatementsSchema.safeParse(value.statements);
  if (!bullets.success || !statements.success) return null;
  return { bullets: bullets.data, statements: statements.data };
}

/**
 * „Začít“ on the chooser, or a finance or pokyn proposal. `clientRef` is the
 * draft's id in the browser, so a retry returns the same draft. A report
 * names its type; finance and pokyn name none (the use case checks the pair
 * and that the type is on offer).
 */
export const pointKindSchema = z.enum([
  'report',
  'finance',
  'pokyn',
]) satisfies z.ZodType<PointKind>;
export const createPointInput = z.strictObject({
  clientRef: z.uuid(),
  kind: pointKindSchema,
  typeId: z.uuid().nullable(),
});
export const createPointOutput = z.object({ id: z.uuid() });

/** ISO text read into a domain value; text the parser refuses is an issue, never a throw. */
const parsedText = <T>(max: number, parse: (text: string) => T) =>
  z
    .string()
    .max(max)
    .transform((text, ctx) => {
      try {
        return parse(text);
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        ctx.addIssue({ code: 'custom', message: 'invalid' });
        return z.NEVER;
      }
    });
const isoDate = parsedText(10, parseIsoDate).nullable();
const wallTime = parsedText(5, parseWallTime).nullable();

/** Every `Campus` once: the compiler refuses a missing or an unknown one. */
const CAMPUSES: Readonly<Record<Campus, Campus>> = {
  smichov: 'smichov',
  radlice: 'radlice',
  'na-vidouli': 'na-vidouli',
  jinde: 'jinde',
};
const campusSchema = z.enum(CAMPUSES) satisfies z.ZodType<Campus>;

const richTextSchema = z.strictObject({
  type: z.literal('text'),
  text: z.string().min(1).max(RICH_LIMITS.maxBytes),
  marks: z
    .array(z.strictObject({ type: z.enum(['bold', 'italic']) }))
    .max(2)
    .optional(),
});
const richParagraphSchema = z.strictObject({
  type: z.literal('paragraph'),
  attrs: z.strictObject({ indent: z.number().int().min(0).max(3) }),
  content: z.array(richTextSchema).max(RICH_LIMITS.maxNodes).optional(),
});

/** The body as the editor sends it and a read gives it back. */
const richDocWire = z.strictObject({
  type: z.literal('doc'),
  content: z.array(richParagraphSchema).max(RICH_LIMITS.maxNodes),
});

/**
 * The body, then the rich text module's own parse (sizes, characters) at the
 * widest profile, as it is stored. Which profile a kind may use is known only
 * once the point is loaded: the use case's rule.
 */
const bodySchema = richDocWire.transform((doc, ctx) => {
  const parsed = parseRichDoc(doc, 'outline');
  if (parsed.ok) return parsed.doc;
  ctx.addIssue({ code: 'custom', message: 'invalid' });
  return z.NEVER;
});

/** The fields of a point's content, with its dates, times and body as one side of the wire has them. */
const contentFields = <D extends z.ZodType, T extends z.ZodType, B extends z.ZodType>(
  date: D,
  time: T,
  body: B,
) => ({
  title: capped(POINT_LIMITS.title),
  eventDate: date,
  endDate: date,
  timeFrom: time,
  timeTo: time,
  campus: campusSchema.nullable(),
  place: capped(POINT_LIMITS.place).nullable(),
  opening: capped(POINT_LIMITS.opening),
  openingEdited: z.boolean(),
  body,
  bullets: draftBulletsSchema,
  statements: draftStatementsSchema,
});

/**
 * A point's content as the editor sends it: every field bounded, an end date
 * never before the start (`points_dates`), and all of it within
 * `contentBytes`. A draft may be unfinished; readiness asks for the rest.
 */
const pointContentSchema = z
  .strictObject(contentFields(isoDate, wallTime, bodySchema))
  .superRefine((content, ctx) => {
    const { eventDate, endDate } = content;
    if (endDate && (!eventDate || compareDates(endDate, eventDate) < 0)) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'invalid' });
    }
    if (contentBytes(content) > POINT_LIMITS.contentBytes) {
      ctx.addIssue({ code: 'custom', message: 'too-long', params: { code: 'too-long' } });
    }
  }) satisfies z.ZodType<PointContent>;

/**
 * A point's content as a read gives it to the editor: dates and times as the
 * ISO text the save takes, so the editor can send it back unchanged.
 */
export const pointContentWire = z.strictObject(
  contentFields(z.iso.date().nullable(), z.iso.time({ precision: -1 }).nullable(), richDocWire),
);

const dateText = (date: CalDate | null) => date && toIsoDate(date);
const timeText = (time: WallTime | null) => time && toIsoTime(time);
const textWire = ({ text, marks }: RichText) => ({
  type: 'text' as const,
  text,
  ...(marks && { marks: marks.map((mark) => ({ type: mark.type })) }),
});
const paragraphWire = ({ attrs, content }: RichParagraph) => ({
  type: 'paragraph' as const,
  attrs: { indent: attrs.indent },
  ...(content && { content: content.map(textWire) }),
});

const bodyWire = (body: PointContent['body']) => ({
  type: 'doc' as const,
  content: body.content.map(paragraphWire),
});
const bulletsWire = (bullets: PointContent['bullets']) =>
  bullets.map((b) => (b.kind === 'people' ? { ...b, people: [...b.people] } : b));

/** The stored content in the wire shape of `pointContentWire`. */
export const contentWire = (content: PointContent): z.input<typeof pointContentWire> => ({
  ...content,
  eventDate: dateText(content.eventDate),
  endDate: dateText(content.endDate),
  timeFrom: timeText(content.timeFrom),
  timeTo: timeText(content.timeTo),
  body: bodyWire(content.body),
  bullets: bulletsWire(content.bullets),
  statements: [...content.statements],
});

/** Some of a content's fields in the wire shape (a review edit's „Původní znění“): no flag, any field may be missing. */
export const pointFieldsWire = pointContentWire.omit({ openingEdited: true }).partial();

/** Stored field values, as a review edit keeps them, in the wire shape of `pointFieldsWire`. */
export function fieldValuesWire({
  eventDate,
  endDate,
  timeFrom,
  timeTo,
  body,
  bullets,
  statements,
  ...text
}: Partial<PointFieldValues>): z.input<typeof pointFieldsWire> {
  return {
    ...text,
    ...(eventDate !== undefined && { eventDate: dateText(eventDate) }),
    ...(endDate !== undefined && { endDate: dateText(endDate) }),
    ...(timeFrom !== undefined && { timeFrom: timeText(timeFrom) }),
    ...(timeTo !== undefined && { timeTo: timeText(timeTo) }),
    ...(body !== undefined && { body: bodyWire(body) }),
    ...(bullets !== undefined && { bullets: bulletsWire(bullets) }),
    ...(statements !== undefined && { statements: [...statements] }),
  };
}

/** A write to a point names the point and the version the page showed. */
const pointWrite = { id: z.uuid(), expectedVersion: z.number().int().positive() };
/** The new version, which the page sends with its next write. */
const pointVersion = z.object({ version: z.number().int().positive() });

/** The author's autosave: the whole content against the version the editor holds. */
export const savePointInput = z.strictObject({ ...pointWrite, content: pointContentSchema });
export const savePointOutput = pointVersion;

/**
 * „Uložit úpravy“ of a reviewer (design section 10): the whole content against the version the
 * page showed, checked as the author's save checks it. `changed` is false when the content equals
 * what is stored: nothing was written and the version stays.
 */
export const reviewEditPointInput = z.strictObject({ ...pointWrite, content: pointContentSchema });
export const reviewEditPointOutput = z.object({
  version: z.number().int().positive(),
  changed: z.boolean(),
});

/** „Odeslat ke kontrole“: the content the editor holds, saved and handed in at once. */
export const submitPointInput = z.strictObject({ ...pointWrite, content: pointContentSchema });
export const submitPointOutput = pointVersion;

/** „Stáhnout“: a submitted point back to the drafts. */
export const retractPointInput = z.strictObject(pointWrite);
export const retractPointOutput = pointVersion;

/** „Zrušit bod“; `confirmed` is the checkbox (ADR 0013 item 10). */
export const withdrawPointInput = z.strictObject({ ...pointWrite, confirmed: z.boolean() });
export const withdrawPointOutput = pointVersion;

/**
 * „Schválit“, „Vrátit k úpravě“, „Zamítnout“ (design section 10). The note is for the author and
 * only the decisions the machine says require one take it. It is trimmed and counted as
 * `String.length` (POINT_LIMITS), so a note within the cap always passes the CHECK on
 * `char_length`; the pipeline has already made every line break one `\n` (ADR 0011 step 2), as
 * the bar's counter counts it. One object with a refinement, since a use case's input is one strict object: a
 * return or a reject without a note is `required` on `note`, an approval with one is `invalid`.
 */
export const decidePointInput = z
  .strictObject({
    ...pointWrite,
    event: z.enum(REVIEW_DECISIONS),
    note: z.string().trim().min(1).max(POINT_LIMITS.note).optional(),
  })
  .superRefine(({ event, note }, ctx) => {
    if ((POINT_MACHINE[event].requiresNote === true) === (note !== undefined)) return;
    const code = note === undefined ? 'required' : 'invalid';
    ctx.addIssue({ code: 'custom', path: ['note'], message: code, params: { code } });
  });
/** The new version, and the next submitted point of the queue the actor may approve (null: none waits). */
export const decidePointOutput = z.object({
  version: z.number().int().positive(),
  next: z.uuid().nullable(),
});

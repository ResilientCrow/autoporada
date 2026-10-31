import { z } from 'zod';

import { OUTLINE_LIMITS } from '@/domain/outline';
import { POINT_LIMITS } from '@/domain/report';
import { hasForbiddenCharacters, parseRichDoc } from '@/domain/richtext';

import { richDocWire } from './point';

const section = z.enum(['pokyny', 'hospodareni']);
const persistence = z.enum(['standing', 'once']);
const slot = z.enum(['meetings', 'events', 'talent', 'exemptions', 'media', 'partners']);
const monday = z.iso.date().max(10);
const version = z.number().int().positive().optional();

/** A title is one line of 1 to 300 characters (`issue_items_title`). */
const title = z
  .string()
  .trim()
  .min(1)
  .max(OUTLINE_LIMITS.title)
  .refine((text) => !hasForbiddenCharacters(text, { allowTab: false }));

/** An item's text at the widest profile, as it is stored. */
const body = richDocWire.transform((doc, ctx) => {
  const parsed = parseRichDoc(doc, 'outline');
  if (parsed.ok) return parsed.doc;
  ctx.addIssue({ code: 'custom', message: 'invalid' });
  return z.NEVER;
});

const capped = (max: number) =>
  z
    .string()
    .max(max)
    .refine((text) => !hasForbiddenCharacters(text, { allowTab: false }));

/** „vyjádření pana …“ of the partners slot; the speaker is in the 2nd case. */
const statement = z.strictObject({
  speakerGenitive: capped(POINT_LIMITS.speakerGenitive).trim().min(1),
  affiliation: capped(POINT_LIMITS.statementAffiliation).optional(),
  quote: capped(POINT_LIMITS.quote).trim().min(1),
});

/**
 * Every outline write names the porada by its Monday and the version of its row the page read; a
 * Monday without a row has none, which reads as an untouched issue. `lineageId` of an added item is
 * made by the form, so a retry adds it once.
 */
export const outlineAddInput = z.strictObject({
  monday,
  expectedVersion: version,
  lineageId: z.uuid(),
  section,
  title,
  persistence,
  body: body.optional(),
});
export const outlineSaveInput = z.strictObject({
  monday,
  expectedVersion: version,
  lineageId: z.uuid(),
  title: title.optional(),
  body: body.optional(),
  quotes: z.array(statement).max(OUTLINE_LIMITS.quotes).optional(),
  persistence: persistence.optional(),
});
export const outlineMoveInput = z.strictObject({
  monday,
  expectedVersion: version,
  lineageId: z.uuid(),
  direction: z.enum(['up', 'down']),
});
export const outlineRemoveInput = z.strictObject({
  monday,
  expectedVersion: version,
  lineageId: z.uuid(),
});
export const outlineWriteOutput = z.strictObject({
  /** The issue's version after the write: what the next write starts from. */
  version: z.int().positive(),
  lineageId: z.uuid(),
});

export const outlineReadInput = z.strictObject({ monday });
const row = z.strictObject({
  lineageId: z.uuid(),
  slot: slot.nullable(),
  persistence,
  /** A proposal row shows its point's title. */
  title: z.string(),
  quotes: z.int().min(0),
  /** Set on a proposal row; `isNew` while nobody has placed it. */
  proposal: z.strictObject({ pointId: z.uuid(), isNew: z.boolean() }).nullable(),
});
export const outlineReadOutput = z.strictObject({
  monday: z.iso.date(),
  /** The day the porada is held. */
  meetingDate: z.iso.date(),
  /** Null for a Monday without a row yet. */
  version: z.int().positive().nullable(),
  origin: z.strictObject({
    kind: z.enum(['stored', 'derived', 'seed']),
    /** The meeting date of the issue a derived outline comes from. */
    from: z.iso.date().nullable(),
  }),
  pokyny: z.array(row),
  hospodareni: z.array(row),
});

export const outlineItemInput = z.strictObject({ monday, lineageId: z.uuid() });
/** One item for its editor: the text as stored (wire shape), the partners' quotes, and who it belongs to. */
export const outlineItemOutput = z.strictObject({
  monday: z.iso.date(),
  /** Null for a Monday without a row yet. */
  version: z.int().positive().nullable(),
  lineageId: z.uuid(),
  section,
  slot: slot.nullable(),
  persistence,
  title: z.string(),
  body: richDocWire,
  quotes: z.array(statement),
  /** Set on a proposal row, whose text is the point's: it is not edited here. */
  proposal: z.strictObject({ pointId: z.uuid() }).nullable(),
});

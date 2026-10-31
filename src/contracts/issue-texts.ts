import { z } from 'zod';

import {
  ANNEX1_MAX_BYTES,
  parseRichDoc,
  stripForbiddenCharacters,
  type RichDoc,
} from '@/domain/richtext';

import { richDocWire } from './point';

/** The most characters of Přítomni or Hosté (`issues_texts`). */
export const ISSUE_TEXT_MAX = 2000;

const monday = z.iso.date().max(10);
const version = z.number().int().positive().optional();

/** Names, one per line or separated by commas: no control or invisible characters, the ends trimmed. */
const names = z
  .string()
  .trim()
  .max(ISSUE_TEXT_MAX)
  .refine((text) => stripForbiddenCharacters(text) === text);

/** Příloha 2 as stored: the widest profile, and small enough for the table (jsonb prints more than JSON). */
const annex = richDocWire.transform((value, ctx): RichDoc => {
  const parsed = parseRichDoc(value, 'outline');
  if (!parsed.ok) {
    ctx.addIssue({ code: 'custom', message: 'invalid' });
    return z.NEVER;
  }
  if (new TextEncoder().encode(JSON.stringify(parsed.doc)).length > ANNEX1_MAX_BYTES) {
    ctx.addIssue({ code: 'custom', params: { code: 'too-long' } });
    return z.NEVER;
  }
  return parsed.doc;
});

/** „Údaje“: both texts are always sent; an empty one clears the text. */
export const issueDetailsInput = z.strictObject({
  monday,
  expectedVersion: version,
  present: names,
  guests: names,
});
/** „Příloha 2“: an empty document removes the annex. */
export const issueAnnex2Input = z.strictObject({ monday, expectedVersion: version, body: annex });
export const issueTextsWriteOutput = z.strictObject({
  /** The issue's version after the write: what the next write starts from. */
  version: z.int().positive(),
});

export const issueTextsInput = z.strictObject({ monday });
export const issueTextsOutput = z.strictObject({
  monday: z.iso.date(),
  /** The day the porada is held. */
  meetingDate: z.iso.date(),
  /** Null for a Monday without a row yet. */
  version: z.int().positive().nullable(),
  present: z.string(),
  guests: z.string(),
  /** The empty document when the porada has no Příloha 2. */
  annex2: richDocWire,
  /** Per text: it is carried from an earlier porada (or empty) and is stored at the first save. */
  carried: z.strictObject({ present: z.boolean(), guests: z.boolean(), annex2: z.boolean() }),
});

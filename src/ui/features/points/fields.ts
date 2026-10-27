import type { z } from 'zod';

import type { savePointInput } from '@/contracts';
import { formatTitleDate, type Campus } from '@/domain/cs';
import { stripForbiddenCharacters } from '@/domain/richtext';
import { parseIsoDate, parseWallTime, toIsoDate, toIsoTime } from '@/domain/time';

/** A point's content as the save takes it, and as the page hands it to the editor. */
export type PointContentWire = z.input<typeof savePointInput>['content'];
type Body = PointContentWire['body'];

/** The body as people type it in the plain textarea: one line per paragraph. */
export function bodyText(body: Body): string {
  return body.content.map((p) => (p.content ?? []).map((t) => t.text).join('')).join('\n');
}

/**
 * The textarea's text as a body: one plain paragraph per line, trimmed as the rich text
 * module does, forbidden characters left out (they include the carriage return, so the
 * only line break left is `\n`). Marks and indents do not survive it: that is fine while
 * nothing else writes the body (M9's editor replaces this control).
 */
export function bodyFromText(text: string): Body {
  const clean = stripForbiddenCharacters(text).trim();
  if (clean === '') return { type: 'doc', content: [] };
  return {
    type: 'doc',
    content: clean.split('\n').map((line) => {
      const trimmed = line.trim();
      return {
        type: 'paragraph' as const,
        attrs: { indent: 0 },
        ...(trimmed && { content: [{ type: 'text' as const, text: trimmed }] }),
      };
    }),
  };
}

function isDate(text: string): boolean {
  try {
    return toIsoDate(parseIsoDate(text)) === text;
  } catch {
    return false;
  }
}

function isTime(text: string): boolean {
  try {
    return toIsoTime(parseWallTime(text)) === text;
  } catch {
    return false;
  }
}

/**
 * What a date control reports as the new value of the field: nothing when cleared, the
 * ISO text when it is a date, and otherwise (a year of five digits, a day that does not
 * exist) the date the field already had, since the server refuses the whole save for it.
 */
export function pickedDate(value: string, current: string | null): string | null {
  if (value === '') return null;
  return isDate(value) ? value : current;
}

/**
 * A date control's change: what it shows from now on and what the content takes. The
 * control keeps the text as typed (Chromium reports a year key by key, `0002-01-14`,
 * `0020-01-14`, and a controlled field that took the old date back would undo each
 * digit); the content follows `pickedDate`.
 */
export function typedDate(
  raw: string,
  current: string | null,
): { readonly shown: string; readonly value: string | null } {
  return { shown: raw, value: pickedDate(raw, current) };
}

/** The same for a time control, which reports `HH:MM`. */
export function pickedTime(value: string, current: string | null): string | null {
  if (value === '') return null;
  return isTime(value) ? value : current;
}

/** „čtvrtek 14. ledna 2027“: the only Czech confirmation of a date the browser shows in its own format. */
export function dateEcho(value: string | null): string | null {
  return value !== null && isDate(value) ? formatTitleDate(parseIsoDate(value)) : null;
}

/** The campuses in the order the form offers them (`points.campus` holds their names). */
export const CAMPUSES = [
  'smichov',
  'radlice',
  'na-vidouli',
  'jinde',
] as const satisfies readonly Campus[];

/** The campus a radio's value names, or null for any other text. */
export function campusOf(value: string): Campus | null {
  return CAMPUSES.find((campus) => campus === value) ?? null;
}

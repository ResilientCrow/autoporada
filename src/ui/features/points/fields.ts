import type { z } from 'zod';

import type { savePointInput } from '@/contracts';
import type { Campus } from '@/domain/cs';
import type { PointContent } from '@/domain/report';
import { parseRichDoc, stripForbiddenCharacters } from '@/domain/richtext';
import { parseIsoDate, parseWallTime } from '@/domain/time';
import { readText } from '@/ui/form';

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

/**
 * The editor's content in the domain's shape, for the preview. Total: it reads what is typed so far,
 * so a date or time that is not one is none, and a body the rich text module refuses is empty.
 */
export function pointContentOf(content: PointContentWire): PointContent {
  const body = parseRichDoc(content.body, 'outline');
  return {
    ...content,
    eventDate: readText(content.eventDate, parseIsoDate),
    endDate: readText(content.endDate, parseIsoDate),
    timeFrom: readText(content.timeFrom, parseWallTime),
    timeTo: readText(content.timeTo, parseWallTime),
    body: body.ok ? body.doc : { type: 'doc', content: [] },
  };
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

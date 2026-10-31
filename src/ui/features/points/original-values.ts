import type { z } from 'zod';

import type { getPointOutput } from '@/contracts';
import { formatLongDate, formatClock } from '@/domain/cs';
import { displayName } from '@/domain/report';
import { parseIsoDate, parseWallTime } from '@/domain/time';
import { points } from '@/ui/copy';

import { bodyText } from './fields';

/** A review edit's „Původní znění“ as `points.get` sends it: the fields it changed, in the wire shape. */
export type EditBefore = z.output<typeof getPointOutput>['timeline'][number]['before'];
type Fields = NonNullable<EditBefore>;

/** A previous value of a field a review edit changed, as plain text. */
export interface OriginalValue {
  readonly label: string;
  readonly text: string;
}

const copy = points.timeline;
const plain = (text: string | null) => text?.trim() || copy.empty;
const lines = (items: readonly string[]) => (items.length === 0 ? copy.empty : items.join('\n'));

const date = (iso: string | null) =>
  iso === null ? copy.empty : formatLongDate(parseIsoDate(iso));
const time = (iso: string | null) => (iso === null ? copy.empty : formatClock(parseWallTime(iso)));

const bullets = (list: NonNullable<Fields['bullets']>) =>
  lines(
    list.map((b) => {
      const value = b.kind === 'people' ? b.people.map(displayName).join(', ') : b.text.trim();
      return `${b.label}: ${value || copy.empty}`;
    }),
  );

const statements = (list: NonNullable<Fields['statements']>) =>
  lines(
    list.map(({ speaker, quote }) => {
      const said = plain(quote);
      return speaker === null ? said : `${displayName(speaker)}: ${said}`;
    }),
  );

/** Each field's value as text, in the content's order; undefined for a field the edit left alone. */
function texts(f: Fields): readonly (readonly [string, string | undefined])[] {
  const when = <T>(value: T | undefined, text: (value: T) => string) =>
    value === undefined ? undefined : text(value);
  return [
    ['title', when(f.title, plain)],
    ['eventDate', when(f.eventDate, date)],
    ['endDate', when(f.endDate, date)],
    ['timeFrom', when(f.timeFrom, time)],
    ['timeTo', when(f.timeTo, time)],
    ['campus', when(f.campus, (c) => (c === null ? copy.empty : points.campus[c]))],
    ['place', when(f.place, plain)],
    ['opening', when(f.opening, plain)],
    ['body', when(f.body, (body) => plain(bodyText(body)))],
    ['bullets', when(f.bullets, bullets)],
    ['statements', when(f.statements, statements)],
  ];
}

const capitalized = (label: string) => label.charAt(0).toLocaleUpperCase('cs') + label.slice(1);

/**
 * „Původní znění“ of a review edit (design D13) as plain text per field, never markup: dates and
 * times written out, people by name, bullets and statements one per line („mluvčí: citace“), an
 * empty value said so. Nothing for an event that kept none.
 */
export function originalValues(before: EditBefore | undefined): OriginalValue[] {
  if (!before) return [];
  return texts(before).flatMap(([field, text]) => {
    const label = copy.field(field);
    return text === undefined || label === null ? [] : [{ label: capitalized(label), text }];
  });
}

import type { OpeningInput } from '@/domain/cs';
import { compareDates } from '@/domain/time';

import { OPENING_KEYS } from './bullets';
import type { DraftPerson, PointContent } from './content';

type NamedPerson = DraftPerson & { readonly salutation: NonNullable<DraftPerson['salutation']> };

const hasSalutation = (person: DraftPerson): person is NamedPerson => person.salutation !== null;

/**
 * The people the opening sentence names: those of the rows whose key is in `OPENING_KEYS`, in row
 * and input order, without anyone who has no salutation yet (the sentence cannot address them).
 */
function organisersOf(content: PointContent): readonly NamedPerson[] {
  return content.bullets.flatMap((bullet) =>
    bullet.kind === 'people' && OPENING_KEYS.includes(bullet.key)
      ? bullet.people.filter(hasSalutation)
      : [],
  );
}

/**
 * What `openingSentence` needs, read from the point's fields, or `null` while
 * the title or the start date is missing. An end date before the start and a
 * time to without a time from are left out; readiness reports them. A missing
 * campus reads as „Jinde“, which names no area. The title's gender is read by
 * `openingSentence` (ADR 0067).
 */
export function openingInput(content: PointContent): OpeningInput | null {
  const title = content.title.trim();
  const { eventDate, endDate, timeFrom, timeTo } = content;
  if (title === '' || eventDate === null) return null;

  const place = content.place?.trim();
  return {
    title,
    date: eventDate,
    ...(endDate && compareDates(endDate, eventDate) >= 0 && { endDate }),
    ...(timeFrom && { from: timeFrom, ...(timeTo && { to: timeTo }) }),
    campus: content.campus ?? 'jinde',
    ...(place && { place }),
    organisers: organisersOf(content),
  };
}

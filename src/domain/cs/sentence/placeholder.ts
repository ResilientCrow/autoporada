import { isSameDate, type CalDate } from '@/domain/time';

import { formatNumericDate, formatNumericRange } from '../dates/format';
import { SALUTATION } from '../names/person';
import { renderPeople, type Person } from '../people/list';
import type { ResponsibleVerb } from './opening';

/** The masculine singular past of each verb an akce can have; „a“, „i“, „y“ are added for the rest. */
const PAST: Readonly<Record<ResponsibleVerb, string>> = {
  organizuje: 'organizoval',
  koordinuje: 'koordinoval',
  zajišťuje: 'zajišťoval',
  vede: 'vedl',
};

/** koordinoval / koordinovala / koordinovali / koordinovaly, agreeing like `organiserVerb`. */
function pastVerb(verb: ResponsibleVerb, people: readonly Person[]): string {
  const stem = PAST[verb];
  const women = people.filter((p) => SALUTATION[p.salutation].sex === 'f').length;
  if (people.length === 1) return women === 1 ? `${stem}a` : stem;
  return women === people.length ? `${stem}y` : `${stem}i`;
}

export interface PlaceholderInput {
  readonly date: CalDate;
  /** Last day of a multi-day akce. */
  readonly endDate?: CalDate;
  readonly title: string;
  /** The akce's own verb („Kdo to zajišťuje“). */
  readonly verb: ResponsibleVerb;
  /** Only those with a salutation: the caller drops the rest. */
  readonly people: readonly Person[];
}

/**
 * What the document says of an akce whose report was not handed in (ADR 0049): „Dne 18. 9. 2027
 * proběhla akce s názvem Testovní akce, kterou organizoval pan Jan Novák (1.A).“ A multi-day akce
 * reads „Ve dnech 16.–18. 9. 2027 …“; with nobody listed the sentence ends after the title.
 */
export function placeholderParagraph(input: PlaceholderInput): string {
  // formatNumericRange throws on a range that ends before it starts.
  const when =
    input.endDate && !isSameDate(input.date, input.endDate)
      ? `Ve dnech ${formatNumericRange(input.date, input.endDate)}`
      : `Dne ${formatNumericDate(input.date)}`;
  const main = `${when} proběhla akce s názvem ${input.title.replace(/\s+/g, ' ').trim()}`;
  if (input.people.length === 0) return `${main}.`;
  const people = renderPeople(input.people, { join: 'and', order: 'input' });
  return `${main}, kterou ${pastVerb(input.verb, input.people)} ${people}.`;
}

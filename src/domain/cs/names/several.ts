import { isTitleAfter } from './titles';

/** A part between commas that is only titles after a name: „Ph.D.“, „Ph.D. MBA“. */
const onlyTitles = (part: string): boolean => part.split(/\s+/).every(isTitleAfter);

/**
 * Whether names typed on one line are several people (ADR 0063 item 2, ADR 0071): a comma
 * separates them, except one before a title after a name, which belongs to that name:
 * „Mgr. Jan Novák, Ph.D.“ is one person, „Jan Novák, Ph.D., Eva Malá“ are two. The one rule
 * of the organizer's verb, the participants' label and the submit check.
 */
export function severalPeople(names: string): boolean {
  const people = names
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '' && !onlyTitles(part));
  return people.length > 1;
}

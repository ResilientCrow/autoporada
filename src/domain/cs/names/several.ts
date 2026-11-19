import { isTitleAfter } from './titles';

/** A bracketed group closing a part, such as an affiliation: „Ph.D. (ČVUT)“. */
const TRAILING_GROUP = /\s*\([^()]*\)$/;

/**
 * A part between commas that is only titles after a name: „Ph.D.“, „Ph.D. MBA“, also with an
 * affiliation in brackets after them, „Ph.D. (ČVUT)“, which belongs to the same person.
 */
const onlyTitles = (part: string): boolean =>
  part.replace(TRAILING_GROUP, '').split(/\s+/).every(isTitleAfter);

/**
 * Whether names typed on one line are several people (ADR 0063 item 2, ADR 0071): a comma
 * separates them, except one before a title after a name, which belongs to that name:
 * „Mgr. Jan Novák, Ph.D.“ and „Jan Novák, Ph.D. (ČVUT)“ are one person, „Jan Novák, Ph.D., Eva
 * Malá“ are two. The one rule of the organizer's verb, the participants' label and the submit
 * check.
 */
export function severalPeople(names: string): boolean {
  const people = names
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '' && !onlyTitles(part));
  return people.length > 1;
}

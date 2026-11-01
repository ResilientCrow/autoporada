import { MAX_FIELDS } from '@/application/core';
import type { FutureContent } from '@/application/ports';
import type { FieldIssueCode, FieldIssues } from '@/contracts';
import { compareDates, compareTimes } from '@/domain/time';

const blank = (text: string | undefined) => text !== undefined && text.trim() === '';

/** What a handed-in item must hold: the pieces the CHECKs and the issue snapshot ask for. */
function readinessIssues(content: FutureContent): FieldIssues {
  const issues: Record<string, FieldIssueCode> = {};
  const { title, startDate, endDate, timeFrom, timeTo, responsible } = content;
  if (title.trim() === '') issues['content.title'] = 'required';
  if (startDate === null) issues['content.startDate'] = 'required';
  if (timeTo !== null) {
    const oneDay =
      endDate === null || (startDate !== null && compareDates(endDate, startDate) === 0);
    if (timeFrom === null || (oneDay && compareTimes(timeTo, timeFrom) <= 0)) {
      issues['content.timeTo'] = 'invalid';
    }
  }
  if (responsible) {
    if (blank(responsible.behalfOf)) issues['content.responsible.behalfOf'] = 'required';
    if (responsible.people.length === 0) issues['content.responsible.people'] = 'required';
    responsible.people.forEach((person, i) => {
      const at = `content.responsible.people.${i}`;
      if (person.familyName.trim() === '') issues[`${at}.familyName`] = 'required';
      if (person.salutation === null) issues[`${at}.salutation`] = 'required';
    });
  }
  return issues;
}

/** The issues of a submit, and of a change to an approved item, which goes back to review: at most MAX_FIELDS. */
export function submitIssues(content: FutureContent): FieldIssues {
  return Object.fromEntries(Object.entries(readinessIssues(content)).slice(0, MAX_FIELDS));
}

export const hasIssues = (issues: FieldIssues): boolean => Object.keys(issues).length > 0;

/** Keys in order, so two contents with the same values are the same text whatever order a store keeps. */
const canonical = (content: FutureContent): string =>
  JSON.stringify(content, (_key, value: unknown) =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1)))
      : value,
  );

/** True when a save would write what is stored. */
export const sameContent = (a: FutureContent, b: FutureContent): boolean =>
  canonical(a) === canonical(b);

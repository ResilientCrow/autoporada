import { MAX_FIELDS } from '@/application/core';
import type { FutureContent } from '@/application/ports';
import type { FieldIssueCode, FieldIssues } from '@/contracts';
import { compareDates, compareTimes } from '@/domain/time';

/**
 * What a handed-in item must hold: the pieces the CHECKs and the issue snapshot ask for. Nobody
 * has to be named (ADR 0060), but a named organizer needs a role (ADR 0063).
 */
const isOneDay = ({ startDate, endDate }: FutureContent): boolean =>
  endDate === null || (startDate !== null && compareDates(endDate, startDate) === 0);

/**
 * A multi-day item prints no time (ADR 0060) and the editors hide the fields, so a save that
 * makes an item multi-day clears them before the checks look at them.
 */
export function withoutTimesOnMultiDay(content: FutureContent): FutureContent {
  if (isOneDay(content) || (content.timeFrom === null && content.timeTo === null)) return content;
  return { ...content, timeFrom: null, timeTo: null };
}

const namesOf = ({ organizer }: FutureContent): string => (organizer ?? '').trim();

/**
 * An item approved before the role existed (ADR 0063) keeps its organizer as typed, with no role,
 * through a change that leaves the names alone.
 */
const keepsTypedOrganizer = (content: FutureContent, stored: FutureContent | undefined): boolean =>
  stored !== undefined && stored.organizerRole === null && namesOf(stored) === namesOf(content);

function readinessIssues(content: FutureContent, stored?: FutureContent): FieldIssues {
  const issues: Record<string, FieldIssueCode> = {};
  const { title, startDate, timeFrom, timeTo, organizerRole } = content;
  if (title.trim() === '') issues['content.title'] = 'required';
  if (startDate === null) issues['content.startDate'] = 'required';
  // Whoever is named, the document says whether they organize or coordinate (ADR 0063).
  if (namesOf(content) !== '' && organizerRole === null && !keepsTypedOrganizer(content, stored)) {
    issues['content.organizerRole'] = 'required';
  }
  const oneDay = isOneDay(content);
  // A multi-day item prints no time (ADR 0060): the editors clear it, a submit refuses it.
  if (!oneDay && (timeFrom !== null || timeTo !== null)) issues['content.timeFrom'] = 'invalid';
  if (timeTo !== null) {
    if (timeFrom === null || (oneDay && compareTimes(timeTo, timeFrom) <= 0)) {
      issues['content.timeTo'] = 'invalid';
    }
  }
  return issues;
}

/**
 * The issues of a submit, and of a change to an approved item (`stored`: what it held), which goes
 * back to review: at most MAX_FIELDS.
 */
export function submitIssues(content: FutureContent, stored?: FutureContent): FieldIssues {
  return Object.fromEntries(Object.entries(readinessIssues(content, stored)).slice(0, MAX_FIELDS));
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

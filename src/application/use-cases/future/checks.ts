import { MAX_FIELDS } from '@/application/core';
import type { FutureContent } from '@/application/ports';
import type { FieldIssueCode, FieldIssues } from '@/contracts';
import type { FutureKind } from '@/domain/calendar';
import { participantsFits, severalPeople } from '@/domain/cs';
import { compareDates, compareTimes } from '@/domain/time';

/**
 * What a handed-in item must hold: the pieces the CHECKs and the issue snapshot ask for. Nobody
 * has to be named (ADR 0060), but a named organizer needs a role (ADR 0063), and the participants
 * of an akce need an address (ADR 0071).
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

const participantsOf = ({ participants }: FutureContent): string => (participants ?? '').trim();

/**
 * Participants approved before the address existed (ADR 0071) print as typed, with no address,
 * through a change that leaves the participants alone.
 */
const keepsTypedParticipants = (
  content: FutureContent,
  stored: FutureContent | undefined,
): boolean =>
  stored !== undefined &&
  stored.participantsAddress === null &&
  participantsOf(stored) === participantsOf(content);

/**
 * A jednání never has an address (ADR 0071): it holds for a draft too, as the CHECK
 * `future_items_address_akce` does.
 */
export function kindIssues(content: FutureContent, kind: FutureKind): FieldIssues {
  return kind === 'jednani' && content.participantsAddress !== null
    ? { 'content.participantsAddress': 'invalid' }
    : {};
}

function readinessIssues(
  content: FutureContent,
  kind: FutureKind,
  stored?: FutureContent,
): FieldIssues {
  const issues: Record<string, FieldIssueCode> = {};
  const { title, startDate, timeFrom, timeTo, organizerRole } = content;
  if (title.trim() === '') issues['content.title'] = 'required';
  if (startDate === null) issues['content.startDate'] = 'required';
  // Whoever is named, the document says whether they organize or coordinate (ADR 0063).
  if (namesOf(content) !== '' && organizerRole === null && !keepsTypedOrganizer(content, stored)) {
    issues['content.organizerRole'] = 'required';
  }
  // Whoever takes part, an akce says how they are addressed, and „slečny a pánové“ needs several.
  const { participantsAddress } = content;
  if (kind === 'akce' && participantsOf(content) !== '') {
    if (participantsAddress === null) {
      if (!keepsTypedParticipants(content, stored)) {
        issues['content.participantsAddress'] = 'required';
      }
    } else if (!participantsFits(participantsAddress, severalPeople(participantsOf(content)))) {
      issues['content.participantsAddress'] = 'several';
    }
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
 * back to review: at most MAX_FIELDS. A jednání has no address, so it needs none.
 */
export function submitIssues(
  content: FutureContent,
  kind: FutureKind,
  stored?: FutureContent,
): FieldIssues {
  const issues = { ...readinessIssues(content, kind, stored), ...kindIssues(content, kind) };
  return Object.fromEntries(Object.entries(issues).slice(0, MAX_FIELDS));
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

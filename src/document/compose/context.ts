import { addDays, parseIsoDate, type CalDate } from '@/domain/time';
import type { IssueSnapshot } from '@/snapshot';

import { routeFuture, type RoutedFuture } from './future';
import type { Tokens } from './text';

/** What every part of compose needs, computed once per document. */
export interface ComposeContext {
  readonly snapshot: IssueSnapshot;
  readonly monday: CalDate;
  readonly meeting: CalDate;
  /** Point 1 window: the meeting week. */
  readonly meetingsTo: CalDate;
  /** Point 2 window: two weeks. */
  readonly eventsTo: CalDate;
  readonly tokens: Tokens;
  readonly future: RoutedFuture;
}

export function composeContext(snapshot: IssueSnapshot): ComposeContext {
  const monday = parseIsoDate(snapshot.issue.monday);
  return {
    snapshot,
    monday,
    meeting: parseIsoDate(snapshot.issue.meetingDate),
    meetingsTo: addDays(monday, 7),
    eventsTo: addDays(monday, 14),
    tokens: { skolniRok: snapshot.issue.schoolYear },
    future: routeFuture(snapshot.futureItems, monday),
  };
}

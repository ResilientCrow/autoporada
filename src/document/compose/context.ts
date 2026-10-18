import { eventsWindow, meetingsWindow, type DateRange } from '@/domain/calendar';
import { parseIsoDate, type CalDate } from '@/domain/time';
import type { IssueSnapshot } from '@/snapshot';

import { routeFuture, type RoutedFuture } from './future';
import type { Tokens } from './text';

/** What every part of compose needs, computed once per document. */
export interface ComposeContext {
  readonly snapshot: IssueSnapshot;
  readonly monday: CalDate;
  readonly meeting: CalDate;
  /** Point 1 window: the meeting week; the same window routes the items. */
  readonly meetings: DateRange;
  /** Point 2 window: two weeks. */
  readonly events: DateRange;
  readonly tokens: Tokens;
  readonly future: RoutedFuture;
}

export function composeContext(snapshot: IssueSnapshot): ComposeContext {
  const monday = parseIsoDate(snapshot.issue.monday);
  return {
    snapshot,
    monday,
    meeting: parseIsoDate(snapshot.issue.meetingDate),
    meetings: meetingsWindow(monday),
    events: eventsWindow(monday),
    tokens: { skolniRok: snapshot.issue.schoolYear },
    future: routeFuture(snapshot.futureItems, monday),
  };
}

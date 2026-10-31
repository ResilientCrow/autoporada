import { eventsWindow, meetingsWindow, type DateRange } from '@/domain/calendar';
import { parseIsoDate, type CalDate } from '@/domain/time';
import type { IssueSnapshot } from '@/snapshot';

import { routeFuture, type RoutedFuture } from './future';
import type { Tokens } from './text';

/** What every part of compose needs, computed once per document. */
export interface ComposeContext {
  readonly snapshot: IssueSnapshot;
  readonly meeting: CalDate;
  /** Point 1 window: a week from the meeting date; the same window routes the items. */
  readonly meetings: DateRange;
  /** Point 2 window: two weeks. */
  readonly events: DateRange;
  readonly tokens: Tokens;
  readonly future: RoutedFuture;
}

export function composeContext(snapshot: IssueSnapshot): ComposeContext {
  const meeting = parseIsoDate(snapshot.issue.meetingDate);
  return {
    snapshot,
    meeting,
    meetings: meetingsWindow(meeting),
    events: eventsWindow(meeting),
    tokens: { skolniRok: snapshot.issue.schoolYear },
    future: routeFuture(snapshot.futureItems, meeting),
  };
}

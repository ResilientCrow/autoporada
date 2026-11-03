import type { z } from 'zod';

import type { UserPrincipal } from '@/application/ports';
import { listMyPoints, queuePoints, reportTally } from '@/application/use-cases';
import type { issuesWindowOutput, reportTallyOutput } from '@/contracts';
import { formatDayMonth, formatNumericDate, formatClock, weekdayName } from '@/domain/cs';
import { can } from '@/domain/policy';
import type { IssueStatus, PointState } from '@/domain/review';
import { addDays, compareDates, instantToWallClock, parseIsoDate, toIsoDate } from '@/domain/time';

import { getContainer } from '../container';
import { runPage } from './run-page';

import { myStanding } from './my-access';
import { orNotFound } from './not-found';
import { reportDueOf, type ReportDueModel } from './report-due';
import { readWindow, standingFrom, type StandingModel } from './standing';
import { getViewer, requestId } from './viewer';

/** How many Mondays the headmaster's strip shows. */
const STRIP_DAYS = 4;

/** One Monday of the strip: its row, or `version: null` where it has none yet. */
interface MeetingDay {
  readonly monday: string;
  /** The date as people read it, „9. 11. 2026“. */
  readonly label: string;
  /** The deadline of a porada moved off its Monday, written out; null for one on its Monday. */
  readonly held: { readonly weekday: string; readonly date: string; readonly time: string } | null;
  readonly status: IssueStatus;
  readonly version: number | null;
}

/** How many of the author's points stand in each state. */
type PointCounts = Readonly<Record<PointState, number>>;

/** The „Moje body“ card: the counts of the newest page of the author's points and the standing line. */
interface MineModel {
  readonly counts: PointCounts;
  /** Where a new point goes and when that closes; null where no calendar is read. */
  readonly standing: StandingModel | null;
}

/** What the home page needs beyond the viewer: a waiting user's standing on asking for access, or the headmaster's strip of meetings and the card of whoever may start points. */
type HomePageModel =
  | {
      readonly kind: 'member';
      /** The next Mondays, for the one who may skip a meeting; null for everyone else. */
      readonly strip: readonly MeetingDay[] | null;
      /** Null for whoever may not start a point, and where the list is refused. */
      readonly mine: MineModel | null;
      /** „Ke kontrole: {n}“, the points waiting for a decision; null for whoever may not review, and where the queue is refused. */
      readonly queue: number | null;
      /** „Akce čekající na zprávu“; null for whoever may not start items, and where the lists are refused. */
      readonly reportDue: ReportDueModel | null;
      /** The headmaster's „neodevzdáno n z m“ for the working porada; null for everyone else, when it owes nothing, and where the read is refused. */
      readonly reportTally: ReportTally | null;
    }
  | { readonly kind: 'pending'; readonly standing: 'open' | 'pending' | 'cooldown' | 'blocked' };

/** The working porada and how many of the akce it owes have no report handed in (ADR 0052). */
type ReportTally = NonNullable<z.output<typeof reportTallyOutput>['porada']>;

/** Where a moved porada is held and when it closes, written out. */
function held(row: { readonly deadlineAt: string }): NonNullable<MeetingDay['held']> {
  const { date, time } = instantToWallClock(new Date(row.deadlineAt));
  return { weekday: weekdayName(date), date: formatDayMonth(date), time: formatClock(time) };
}

/** The Mondays from the first one whose deadline is ahead on (a skipped one stays, to be undone), each with its row's status and version or the untouched defaults. */
function meetingStrip(window: z.output<typeof issuesWindowOutput>): readonly MeetingDay[] {
  const rows = new Map(window.issues.map((issue) => [issue.monday, issue]));
  const first = parseIsoDate(window.stripFrom);
  return Array.from({ length: STRIP_DAYS }, (_, week) => {
    const monday = addDays(first, 7 * week);
    const row = rows.get(toIsoDate(monday));
    const meeting = row ? parseIsoDate(row.meetingDate) : monday;
    return {
      monday: toIsoDate(monday),
      label: formatNumericDate(meeting),
      held: row && compareDates(meeting, monday) !== 0 ? held(row) : null,
      status: row?.status ?? 'open',
      version: row?.version ?? null,
    };
  });
}

const NO_POINTS: PointCounts = {
  draft: 0,
  submitted: 0,
  returned: 0,
  approved: 0,
  rejected: 0,
  withdrawn: 0,
  published: 0,
};

/** The author's newest page of points, counted by state; null where the list is refused. */
async function pointCounts(viewer: UserPrincipal): Promise<PointCounts | null> {
  const listed = orNotFound(
    'points.listMine',
    await runPage(listMyPoints, {
      principal: viewer,
      requestId: await requestId(),
      input: {},
    }),
  );
  if (listed === null) return null;
  return listed.points.reduce(
    (counts, { state }) => ({ ...counts, [state]: counts[state] + 1 }),
    NO_POINTS,
  );
}

/** How many submitted points wait for a decision; the approved ones are decided. Null where the queue is refused. */
async function waitingCount(viewer: UserPrincipal): Promise<number | null> {
  const queue = orNotFound(
    'points.queue',
    await runPage(queuePoints, {
      principal: viewer,
      requestId: await requestId(),
      input: {},
    }),
  );
  return (
    queue && queue.mondays.flatMap(({ kinds }) => kinds).reduce((n, k) => n + k.points.length, 0)
  );
}

/** The headmaster's count of missing akce reports; null when the working porada owes nothing or the read is refused. */
async function tallyOf(viewer: UserPrincipal): Promise<ReportTally | null> {
  const read = orNotFound(
    'issues.reportTally',
    await runPage(reportTally, {
      principal: viewer,
      requestId: await requestId(),
      input: {},
    }),
  );
  return read && read.porada;
}

/**
 * The home page's model, or null for a visitor or a refusal. Whoever may start a point costs the
 * window read (the standing line, and for the one who may skip a meeting the strip, from the same
 * read) and the list of their points; neither refusal takes the page away from them but the
 * strip's, which the headmaster's page cannot do without. A reviewer also costs the queue, for its count,
 * and the headmaster the count of the akce reports the working porada lacks.
 */
export async function homePage(): Promise<HomePageModel | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  if (viewer.actor.role !== 'pending') {
    if (!can(viewer.actor, { action: 'point.create' })) {
      return {
        kind: 'member',
        strip: null,
        mine: null,
        queue: null,
        reportDue: null,
        reportTally: null,
      };
    }
    const mayReview = can(viewer.actor, { action: 'review.queue' });
    const mayTally = can(viewer.actor, { action: 'issue.edit' });
    const [window, counts, queue, due, tally] = await Promise.all([
      readWindow(viewer),
      pointCounts(viewer),
      mayReview ? waitingCount(viewer) : null,
      reportDueOf(viewer),
      mayTally ? tallyOf(viewer) : null,
    ]);
    const mayStrip = can(viewer.actor, { action: 'issue.generate' });
    if (mayStrip && window === null) return null;
    const now = getContainer().app.clock.now();
    return {
      kind: 'member',
      strip: mayStrip && window !== null ? meetingStrip(window) : null,
      mine: counts && { counts, standing: window && standingFrom(window, now) },
      queue,
      reportDue: due,
      reportTally: tally,
    };
  }
  const standing = await myStanding(viewer);
  if (standing === null) return null;
  // A pending role is never a member; the use case says so for anyone else.
  return { kind: 'pending', standing: standing.kind === 'member' ? 'open' : standing.kind };
}

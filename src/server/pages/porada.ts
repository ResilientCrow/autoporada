import type { z } from 'zod';

import type { UserPrincipal } from '@/application/ports';
import { issueWorkspace } from '@/application/use-cases';
import type { issueWorkspaceOutput } from '@/contracts';
import {
  formatDayMonth,
  formatNumericDate,
  formatTime,
  formatTitleDate,
  weekdayName,
} from '@/domain/cs';
import { can } from '@/domain/policy';
import type { IssueStatus } from '@/domain/review';
import { compareDates, instantToWallClock, parseIsoDate } from '@/domain/time';

import { getContainer } from '../container';
import { runRegistered } from '../pipeline';

import { orNotFound } from './not-found';
import { getViewer, requestId } from './viewer';

type Workspace = z.output<typeof issueWorkspaceOutput>;

async function readWorkspace(viewer: UserPrincipal, monday?: string): Promise<Workspace | null> {
  return orNotFound(
    'issues.workspace',
    await runRegistered(getContainer(), issueWorkspace, {
      principal: viewer,
      requestId: await requestId(),
      input: monday === undefined ? {} : { monday },
    }),
  );
}

/** /porada: the Monday of the porada to prepare, or null when the calendar has none. */
export interface PoradaIndexModel {
  readonly working: string | null;
}

/** The index of „Porada“, or null (404) for anyone but the headmaster. */
export async function poradaIndexPage(): Promise<PoradaIndexModel | null> {
  const viewer = await getViewer();
  if (!viewer || !can(viewer.actor, { action: 'issue.edit' })) return null;
  const read = await readWorkspace(viewer);
  return read && { working: read.working };
}

/** /porada/[datum]: one porada as the headmaster prepares it, its dates written out. */
export interface PoradaPageModel {
  /** The slot's key, in the URLs of its steps. */
  readonly monday: string;
  /** „pondělí 9. listopadu 2026“: where the porada is held. */
  readonly meeting: string;
  /** „9. 11. 2026“. */
  readonly meetingLabel: string;
  /** „9. 11.“ when the porada is held on another day than its Monday. */
  readonly movedFrom: string | null;
  readonly deadline: { readonly weekday: string; readonly date: string; readonly time: string };
  readonly deadlinePassed: boolean;
  readonly status: IssueStatus;
  /** Null for a Monday without a row yet. */
  readonly version: number | null;
  readonly counts: NonNullable<Workspace['slot']>['counts'];
}

/** The page of one slot, or null (404) for anyone but the headmaster and for a Monday outside the calendar. */
export async function poradaPage(datum: string): Promise<PoradaPageModel | null> {
  const viewer = await getViewer();
  if (!viewer || !can(viewer.actor, { action: 'issue.edit' })) return null;
  const read = await readWorkspace(viewer, datum);
  if (read === null || read.slot === null) return null;
  const { slot } = read;
  const monday = parseIsoDate(slot.monday);
  const meeting = parseIsoDate(slot.meetingDate);
  const deadlineAt = new Date(slot.deadlineAt);
  const { date, time } = instantToWallClock(deadlineAt);
  return {
    monday: slot.monday,
    meeting: formatTitleDate(meeting),
    meetingLabel: formatNumericDate(meeting),
    movedFrom: compareDates(monday, meeting) === 0 ? null : formatDayMonth(monday),
    deadline: { weekday: weekdayName(date), date: formatDayMonth(date), time: formatTime(time) },
    deadlinePassed: deadlineAt.getTime() <= getContainer().app.clock.now().getTime(),
    status: slot.status,
    version: slot.version,
    counts: slot.counts,
  };
}

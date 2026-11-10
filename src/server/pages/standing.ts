import type { z } from 'zod';

import type { UserPrincipal } from '@/application/ports';
import { issueWindow } from '@/application/use-cases';
import { toDeadlineRule, type issuesWindowOutput } from '@/contracts';
import type { DeadlineRule } from '@/domain/calendar';

import { runPage } from './run-page';

import { orNotFound } from './not-found';
import { requestId } from './viewer';

/** `issues.window` as the use case answers: the submit Monday and the rows of the next 26 weeks. */
export type MeetingWindow = z.output<typeof issuesWindowOutput>;

/** The meeting calendar as the standing line needs it: `issues.window`, the instant it was read and the deadline rule. */
export interface StandingModel {
  readonly submitMonday: string;
  readonly issues: MeetingWindow['issues'];
  /** ISO instant. */
  readonly now: string;
  readonly rule: DeadlineRule;
  /** The calendar's effective boundary (ADR 0054): up to it a Monday with no row is no porada. */
  readonly plannedThrough: string;
}

/** The meeting calendar as the viewer, or null where the use case refuses it (404). */
export async function readWindow(viewer: UserPrincipal): Promise<MeetingWindow | null> {
  return orNotFound(
    'issues.window',
    await runPage(issueWindow, {
      principal: viewer,
      requestId: await requestId(),
      input: {},
    }),
  );
}

/** The window as the standing line takes it, as of `now`, with the rule the window carries. */
export function standingFrom(window: MeetingWindow, now: Date): StandingModel {
  return {
    submitMonday: window.submitMonday,
    issues: window.issues,
    now: now.toISOString(),
    rule: toDeadlineRule(window.rule),
    plannedThrough: window.plannedThrough,
  };
}

/** Where a draft will go and when that porada closes. Null when the calendar is refused: the line is a convenience. */
export async function standingOf(viewer: UserPrincipal, now: Date): Promise<StandingModel | null> {
  const window = await readWindow(viewer);
  return window && standingFrom(window, now);
}

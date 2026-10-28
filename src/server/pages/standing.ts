import type { z } from 'zod';

import type { UserPrincipal } from '@/application/ports';
import { DEADLINE_RULE } from '@/application/core';
import { issueWindow } from '@/application/use-cases';
import type { issuesWindowOutput } from '@/contracts';

import { getContainer } from '../container';
import { runRegistered } from '../pipeline';

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
  readonly rule: typeof DEADLINE_RULE;
}

/** The meeting calendar as the viewer, or null where the use case refuses it (404). */
export async function readWindow(viewer: UserPrincipal): Promise<MeetingWindow | null> {
  return orNotFound(
    'issues.window',
    await runRegistered(getContainer(), issueWindow, {
      principal: viewer,
      requestId: await requestId(),
      input: {},
    }),
  );
}

/** The window as the standing line takes it, as of `now`. */
export function standingFrom(window: MeetingWindow, now: Date): StandingModel {
  return {
    submitMonday: window.submitMonday,
    issues: window.issues,
    now: now.toISOString(),
    rule: DEADLINE_RULE,
  };
}

/** Where a draft will go and when that porada closes. Null when the calendar is refused: the line is a convenience. */
export async function standingOf(viewer: UserPrincipal, now: Date): Promise<StandingModel | null> {
  const window = await readWindow(viewer);
  return window && standingFrom(window, now);
}

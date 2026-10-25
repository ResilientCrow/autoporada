import type { z } from 'zod';

import { issueWindow } from '@/application/use-cases';
import type { issuesWindowOutput } from '@/contracts';
import { formatNumericDate } from '@/domain/cs';
import { can } from '@/domain/policy';
import type { IssueStatus } from '@/domain/review';
import { addDays, parseIsoDate, toIsoDate } from '@/domain/time';

import { getContainer } from '../container';
import { runRegistered } from '../pipeline';

import { myStanding } from './my-access';
import { orNotFound } from './not-found';
import { getViewer, requestId } from './viewer';

/** How many Mondays the headmaster's strip shows. */
const STRIP_DAYS = 4;

/** One Monday of the strip: its row, or `version: null` where it has none yet. */
interface MeetingDay {
  readonly monday: string;
  /** The date as people read it, „9. 11. 2026“. */
  readonly label: string;
  readonly status: IssueStatus;
  readonly version: number | null;
}

/** What the home page needs beyond the viewer: a waiting user's standing on asking for access, or the headmaster's strip of meetings. */
type HomePageModel =
  | {
      readonly kind: 'member';
      /** The next Mondays, for the one who may skip a meeting; null for everyone else. */
      readonly strip: readonly MeetingDay[] | null;
    }
  | { readonly kind: 'pending'; readonly standing: 'open' | 'pending' | 'cooldown' | 'blocked' };

/** The Mondays from the submit Monday on, each with its row's status and version or the untouched defaults. */
function meetingStrip(window: z.output<typeof issuesWindowOutput>): readonly MeetingDay[] {
  const rows = new Map(window.issues.map((issue) => [issue.monday, issue]));
  const first = parseIsoDate(window.submitMonday);
  return Array.from({ length: STRIP_DAYS }, (_, week) => {
    const monday = addDays(first, 7 * week);
    const row = rows.get(toIsoDate(monday));
    return {
      monday: toIsoDate(monday),
      label: formatNumericDate(monday),
      status: row?.status ?? 'open',
      version: row?.version ?? null,
    };
  });
}

/** The home page's model, or null for a visitor or a refusal. A pending user costs the standing lookup and the one who may skip a meeting costs the window read. */
export async function homePage(): Promise<HomePageModel | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  if (viewer.actor.role !== 'pending') {
    if (!can(viewer.actor, { action: 'issue.generate' })) return { kind: 'member', strip: null };
    const window = await runRegistered(getContainer(), issueWindow, {
      principal: viewer,
      requestId: await requestId(),
      input: {},
    }).then((result) => orNotFound('issues.window', result));
    if (window === null) return null;
    return { kind: 'member', strip: meetingStrip(window) };
  }
  const standing = await myStanding(viewer);
  if (standing === null) return null;
  // A pending role is never a member; the use case says so for anyone else.
  return { kind: 'pending', standing: standing.kind === 'member' ? 'open' : standing.kind };
}

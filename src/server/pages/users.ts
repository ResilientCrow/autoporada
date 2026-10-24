import { listUsers, pendingAccess } from '@/application/use-cases';
import { USER_GROUP_SLUGS, USER_QUERY_MAX, type UserGroup } from '@/contracts';
import { formatLongDate } from '@/domain/cs';
import { instantToWallClock } from '@/domain/time';
import type { z } from 'zod';
import type { listUsersOutput, pendingAccessOutput } from '@/contracts';

import { getContainer } from '../container';
import { runRegistered } from '../pipeline';

import { first, type SearchParams } from './params';
import { getViewer, requestId } from './viewer';

/** A request waiting for the headmaster, its date written out. */
type QueueItem = Pick<
  z.output<typeof pendingAccessOutput>['items'][number],
  'requestId' | 'version' | 'displayName' | 'jobTitle' | 'department' | 'reason' | 'events'
> & { readonly submitted: string };

type Outcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: string } };

/** The Prague calendar day of an instant, as „12. října 2026“. */
const day = (iso: string) => formatLongDate(instantToWallClock(new Date(iso)).date);

export interface UsersPageModel {
  readonly queue: readonly QueueItem[];
  readonly users: z.output<typeof listUsersOutput>['users'];
  readonly total: number;
  /** The search text as it was used, or ''. */
  readonly q: string;
  readonly group: UserGroup;
}

const GROUP_OF = new Map<string, UserGroup>(
  (Object.entries(USER_GROUP_SLUGS) as [UserGroup, string][]).map(([group, slug]) => [slug, group]),
);

/** The search text: trimmed, and dropped when empty or longer than the use case accepts. */
function textOf(value: string | string[] | undefined): string {
  const text = first(value)?.trim() ?? '';
  return text.length > USER_QUERY_MAX ? '' : text;
}

/** The users page from its query string; anything unexpected falls back to the defaults. */
export async function usersPage(params: SearchParams): Promise<UsersPageModel | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  const q = textOf(params['hledat']);
  const group = GROUP_OF.get(first(params['skupina']) ?? '') ?? 'all';
  const run = async <T>(call: () => Promise<Outcome<T>>, name: string): Promise<T | null> => {
    const result = await call();
    if (result.ok) return result.value;
    const { code } = result.error;
    if (code === 'forbidden' || code === 'not-found' || code === 'invalid-input') return null;
    throw new Error(`${name}: ${code}`);
  };
  const base = { principal: viewer, requestId: await requestId() };
  const [list, pending] = await Promise.all([
    run(
      () =>
        runRegistered(getContainer(), listUsers, {
          ...base,
          input: { ...(q === '' ? {} : { q }), group },
        }),
      'users.list',
    ),
    run(
      () => runRegistered(getContainer(), pendingAccess, { ...base, input: {} }),
      'access.pending',
    ),
  ]);
  if (list === null || pending === null) return null;
  const queue = pending.items.map((item) => ({
    requestId: item.requestId,
    version: item.version,
    displayName: item.displayName,
    jobTitle: item.jobTitle,
    department: item.department,
    reason: item.reason,
    events: item.events,
    submitted: day(item.requestedAt),
  }));
  return { ...list, queue, q, group };
}

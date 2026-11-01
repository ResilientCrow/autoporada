import { listUsers, pendingAccess } from '@/application/use-cases';
import { USER_GROUP_SLUGS, USER_QUERY_MAX, type UserGroup } from '@/contracts';
import type { z } from 'zod';
import type { listUsersOutput, pendingAccessOutput } from '@/contracts';

import { runPage } from './run-page';

import { day } from './dates';
import { orNotFound } from './not-found';
import { first, type SearchParams } from './params';
import { getViewer, requestId } from './viewer';

/** A request waiting for the headmaster, its date written out. */
type QueueItem = Pick<
  z.output<typeof pendingAccessOutput>['items'][number],
  | 'requestId'
  | 'userId'
  | 'version'
  | 'displayName'
  | 'jobTitle'
  | 'department'
  | 'reason'
  | 'events'
> & { readonly submitted: string };

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
function searchText(value: string | string[] | undefined): string {
  const text = first(value)?.trim() ?? '';
  return text.length > USER_QUERY_MAX ? '' : text;
}

/** The users page from its query string; anything unexpected falls back to the defaults. */
export async function usersPage(params: SearchParams): Promise<UsersPageModel | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  const q = searchText(params['hledat']);
  const group = GROUP_OF.get(first(params['skupina']) ?? '') ?? 'all';
  const base = { principal: viewer, requestId: await requestId() };
  const [list, pending] = await Promise.all([
    runPage(listUsers, {
      ...base,
      input: { ...(q === '' ? {} : { q }), group },
    }).then((result) => orNotFound('users.list', result)),
    runPage(pendingAccess, { ...base, input: {} }).then((result) =>
      orNotFound('access.pending', result),
    ),
  ]);
  if (list === null || pending === null) return null;
  const queue = pending.items.map((item) => ({
    requestId: item.requestId,
    userId: item.userId,
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

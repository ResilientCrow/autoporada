import { listUsers } from '@/application/use-cases';
import { USER_GROUP_SLUGS, USER_QUERY_MAX, type UserGroup } from '@/contracts';
import type { z } from 'zod';
import type { listUsersOutput } from '@/contracts';

import { getContainer } from '../container';
import { runRegistered } from '../pipeline';

import { first, type SearchParams } from './params';
import { getViewer, requestId } from './viewer';

export interface UsersPageModel {
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
  const result = await runRegistered(getContainer(), listUsers, {
    principal: viewer,
    requestId: await requestId(),
    input: { ...(q === '' ? {} : { q }), group },
  });
  if (result.ok) return { ...result.value, q, group };
  const { code } = result.error;
  if (code === 'forbidden' || code === 'not-found' || code === 'invalid-input') return null;
  throw new Error(`users.list: ${code}`);
}

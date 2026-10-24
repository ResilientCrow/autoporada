import type { UserGroup } from '@/contracts';
import type { UserRecord } from '@/application/ports';
import { csCollator, foldForSearch } from '@/domain/cs';

/** The list shows this many users; `total` says how many matched. */
export const USERS_LIST_CAP = 100;

const inGroup = (user: UserRecord, group: UserGroup): boolean => {
  if (group === 'all') return true;
  if (group === 'inactive') return user.status !== 'active';
  return user.status === 'active' && user.role === group;
};

/**
 * The users list: the group, then the search (folded text inside the folded
 * name or email), in Czech order by name, capped at `USERS_LIST_CAP`.
 */
export function selectUsers(
  rows: readonly UserRecord[],
  { text, group }: { readonly text?: string | undefined; readonly group: UserGroup },
): { readonly rows: readonly UserRecord[]; readonly total: number } {
  const needle = foldForSearch((text ?? '').trim());
  const matches = rows
    .filter((user) => inGroup(user, group))
    .filter(
      (user) =>
        needle === '' ||
        foldForSearch(user.displayName).includes(needle) ||
        foldForSearch(user.email ?? '').includes(needle),
    )
    .sort((a, b) => csCollator.compare(a.displayName, b.displayName) || (a.id < b.id ? -1 : 1));
  return { rows: matches.slice(0, USERS_LIST_CAP), total: matches.length };
}

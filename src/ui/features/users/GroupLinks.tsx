import Link from 'next/link';

import { USER_GROUP_SLUGS, USER_GROUPS, type UserGroup } from '@/contracts';
import { users } from '@/ui/copy';
import { buttonStyles } from '@/ui/kit';

const PAGE = 'page';
/** The current group looks pressed; the others like secondary buttons. */
const CURRENT = buttonStyles('primary');
const OTHER = buttonStyles('secondary');

/** The address of a group of the list, keeping the search text. */
function groupHref(group: UserGroup, q: string): string {
  const params = new URLSearchParams({ skupina: USER_GROUP_SLUGS[group] });
  if (q !== '') params.set('hledat', q);
  return `/uzivatele?${params.toString()}`;
}

/** The groups of the list as links: every one a 44 px target, the current one marked. */
export function GroupLinks({ group, q }: { readonly group: UserGroup; readonly q: string }) {
  return (
    <nav aria-label={users.people.groupsLabel}>
      <ul className="flex flex-wrap gap-2">
        {USER_GROUPS.map((candidate) => (
          <li key={candidate}>
            <Link
              href={groupHref(candidate, q)}
              prefetch={false}
              aria-current={candidate === group ? PAGE : undefined}
              className={candidate === group ? CURRENT : OTHER}
            >
              {users.people.groups[candidate]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

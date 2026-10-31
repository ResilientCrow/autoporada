import { USER_GROUP_SLUGS, USER_GROUPS, type UserGroup } from '@/contracts';
import { users } from '@/ui/copy';
import { ButtonLink } from '@/ui/kit';

/** The address of a group of the list, keeping the search text. */
function groupHref(group: UserGroup, q: string): `/${string}` {
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
            <ButtonLink
              href={groupHref(candidate, q)}
              variant="secondary"
              current={candidate === group}
            >
              {users.people.groups[candidate]}
            </ButtonLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

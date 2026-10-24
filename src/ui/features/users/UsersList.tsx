import { USER_GROUP_SLUGS, type UserGroup } from '@/contracts';
import type { Role, UserStatus } from '@/domain/actor';
import { users } from '@/ui/copy';
import { SearchForm } from '@/ui/form';
import { SlantLabel } from '@/ui/kit';
import { ACCOUNT_LOOK, Chip, ROLE_LOOK, STUDENT_LOOK } from '@/ui/status';

import { GroupLinks } from './GroupLinks';

/** The list's model: the people found, their count, and the search it answers. */
export interface UsersView {
  readonly users: readonly {
    readonly id: string;
    readonly displayName: string;
    readonly email: string | null;
    readonly role: Role;
    readonly status: UserStatus;
    readonly isStudent: boolean;
  }[];
  readonly total: number;
  readonly q: string;
  readonly group: UserGroup;
}

/** „Uživatelé“: the search, the groups and the people found (the queue of requests goes above „Lidé“). */
export function UsersList({ view }: { readonly view: UsersView }) {
  const { people } = users;
  return (
    <>
      <SlantLabel level={1}>{users.title}</SlantLabel>
      <section className="mt-4 space-y-3">
        <h2 className="text-xl">{people.title}</h2>
        <SearchForm
          path="/uzivatele"
          label={people.searchLabel}
          submit={people.search}
          query={view.q}
          keep={{ name: 'skupina', value: USER_GROUP_SLUGS[view.group] }}
        />
        <GroupLinks group={view.group} q={view.q} />
        <p>{people.found(view.total)}</p>
        {view.total > view.users.length && <p>{people.capped(view.users.length, view.total)}</p>}
        {view.users.length === 0 ? (
          <p>{people.empty}</p>
        ) : (
          <ul className="space-y-2">
            {view.users.map((user) => (
              <li key={user.id} className="space-y-1 border-b-2 border-ink pb-2">
                <p className="font-bold">{user.displayName}</p>
                {user.email !== null && <p className="break-all">{user.email}</p>}
                <p className="flex flex-wrap gap-2">
                  <Chip look={ROLE_LOOK[user.role]} />
                  {user.isStudent && <Chip look={STUDENT_LOOK} />}
                  <Chip look={ACCOUNT_LOOK[user.status]} />
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

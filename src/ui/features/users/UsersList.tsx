import Link from 'next/link';

import type { z } from 'zod';

import { USER_GROUP_SLUGS, type listUsersOutput, type UserGroup } from '@/contracts';
import { users } from '@/ui/copy';
import { SearchForm } from '@/ui/form';
import { SlantLabel } from '@/ui/kit';
import { ACCOUNT_LOOK, Chip, ROLE_LOOK, STUDENT_LOOK } from '@/ui/status';

import type { DecideAction } from './DecisionForm';
import { GroupLinks } from './GroupLinks';
import { Queue, type QueueItemView } from './Queue';

/** The list's model: the people found, their count, and the search it answers. */
export interface UsersView {
  readonly queue: readonly QueueItemView[];
  readonly users: readonly z.output<typeof listUsersOutput>['users'][number][];
  readonly total: number;
  readonly q: string;
  readonly group: UserGroup;
}

/** „Uživatelé“: the search, the groups and the people found (the queue of requests goes above „Lidé“). */
export function UsersList({
  view,
  decideAccess,
}: {
  readonly view: UsersView;
  readonly decideAccess: DecideAction;
}) {
  const { people } = users;
  return (
    <>
      <SlantLabel level={1}>{users.title}</SlantLabel>
      <div className="mt-4 space-y-8">
        <Queue items={view.queue} decideAccess={decideAccess} />
        <section className="space-y-3">
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
                  <p>
                    <Link href={`/uzivatele/${user.id}`} prefetch={false} className="font-bold">
                      {user.displayName}
                    </Link>
                  </p>
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
      </div>
    </>
  );
}

import type { Role, UserStatus } from '@/domain/actor';
import { users } from '@/ui/copy';
import { ACCOUNT_LOOK, Chip, ROLE_LOOK, STUDENT_LOOK } from '@/ui/status';

/** What the page shows of the person themself. */
export interface UserFactsView {
  readonly email: string | null;
  readonly role: Role;
  readonly status: UserStatus;
  readonly isStudent: boolean;
  readonly since: string;
}

/** The facts as a description list: e-mail, role, account, and since when. */
export function UserFacts({ user }: { readonly user: UserFactsView }) {
  const { detail } = users;
  return (
    <section className="space-y-2">
      <dl className="space-y-2">
        {user.email !== null && (
          <div>
            <dt className="font-bold">{detail.email}</dt>
            <dd className="break-all">{user.email}</dd>
          </div>
        )}
        <div>
          <dt className="font-bold">{detail.role}</dt>
          <dd className="flex flex-wrap gap-2">
            <Chip look={ROLE_LOOK[user.role]} />
            {user.isStudent && <Chip look={STUDENT_LOOK} />}
          </dd>
        </div>
        <div>
          <dt className="font-bold">{detail.account}</dt>
          <dd>
            <Chip look={ACCOUNT_LOOK[user.status]} />
          </dd>
        </div>
      </dl>
      <p>{detail.since(user.since)}</p>
    </section>
  );
}

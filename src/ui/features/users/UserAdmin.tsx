'use client';

import { useRef, useState } from 'react';

import type { Role } from '@/domain/actor';
import { users } from '@/ui/copy';
import { LiveStatus, NoScriptNotice, StepUpNotice, useFocusOnRise } from '@/ui/form';
import { Notice, SlantLabel } from '@/ui/kit';

import type { DecideAction } from './DecisionForm';
import { AccountForm } from './AccountForm';
import { RequestSection, type RequestView } from './RequestSection';
import { RoleForm, type ChangeAccessAction, type RoleFormUser } from './RoleForm';
import { UserFacts, type UserFactsView } from './UserFacts';

const SAID = {
  approved: users.queue.said.approved,
  rejected: users.queue.said.rejected,
  blocked: users.detail.block.said,
  changed: users.detail.access.said.changed,
  unchanged: users.detail.access.said.unchanged,
} as const;

/** What was done to an account, by the status it had. */
const ACCOUNT_SAID = {
  active: users.detail.accountStatus.said.blocked,
  blocked: users.detail.accountStatus.said.unblocked,
  deactivated: users.detail.accountStatus.said.restored,
} as const;

/** The page's model, with its dates written out. */
export interface UserView {
  readonly user: UserFactsView & RoleFormUser & { readonly displayName: string };
  readonly isSelf: boolean;
  readonly choices: { readonly roles: readonly Role[]; readonly statuses: readonly string[] };
  readonly request: RequestView | null;
  readonly requestEvents: readonly string[];
}

type Section = 'request' | 'role' | 'account';

/**
 * The host of one user's page. Every section has a focusable h2: after a
 * successful write focus goes to the heading of the section that was sent (the
 * write refreshes the page, so the sections stay and only their content changes).
 * The request decision is never behind step-up; the role and account sections are.
 */
export function UserAdmin({
  view,
  freshAuth,
  decideAccess,
  changeUserAccess,
}: {
  readonly view: UserView;
  readonly freshAuth: boolean;
  readonly decideAccess: DecideAction;
  readonly changeUserAccess: ChangeAccessAction;
}) {
  const { detail } = users;
  const requestHeading = useRef<HTMLHeadingElement>(null);
  const roleHeading = useRef<HTMLHeadingElement>(null);
  const accountHeading = useRef<HTMLHeadingElement>(null);
  const [said, setSaid] = useState<{ message: string; count: number; section: Section }>({
    message: '',
    count: 0,
    section: 'request',
  });
  const say = (message: string, section: Section) =>
    setSaid((s) => ({ message, count: s.count + 1, section }));
  useFocusOnRise(requestHeading, said.section === 'request' ? said.count : 0);
  useFocusOnRise(roleHeading, said.section === 'role' ? said.count : 0);
  useFocusOnRise(accountHeading, said.section === 'account' ? said.count : 0);

  const { choices, request, user } = view;
  const pending = request?.state === 'pending';
  const offered = choices.roles.length > 0 || choices.statuses.length > 0;
  const hasForm =
    (request !== null && view.requestEvents.length > 0) ||
    (!view.isSelf && !pending && freshAuth && choices.roles.length > 0) ||
    (!view.isSelf && freshAuth && choices.statuses.length > 0);
  return (
    <>
      <SlantLabel level={1}>{user.displayName}</SlantLabel>
      <div className="mt-4 space-y-8">
        <UserFacts user={user} />
        {request !== null && (
          <RequestSection
            request={request}
            events={view.requestEvents}
            decideAccess={decideAccess}
            headingRef={requestHeading}
            onDecided={(state) => say(SAID[state], 'request')}
          />
        )}
        {view.isSelf && (
          <Notice tone="info" live={false}>
            {detail.own}
          </Notice>
        )}
        {!view.isSelf && pending && (
          <section className="space-y-3">
            <h2 className="text-xl">{detail.access.title}</h2>
            <p>{detail.access.pendingRequest}</p>
          </section>
        )}
        {!view.isSelf && !pending && freshAuth && choices.roles.length > 0 && (
          <RoleForm
            key={user.version}
            action={changeUserAccess}
            user={user}
            roles={choices.roles}
            headingRef={roleHeading}
            onSaved={(changed) => say(changed ? SAID.changed : SAID.unchanged, 'role')}
          />
        )}
        {!view.isSelf && freshAuth && choices.statuses.length > 0 && (
          <AccountForm
            key={user.version}
            action={changeUserAccess}
            user={user}
            headingRef={accountHeading}
            onSaved={(changed) =>
              say(changed ? ACCOUNT_SAID[user.status] : SAID.unchanged, 'account')
            }
          />
        )}
        {!view.isSelf && !freshAuth && offered && (
          <StepUpNotice returnTo={`/uzivatele/${user.id}`} />
        )}
        <LiveStatus message={said.message} count={said.count} />
        {hasForm && <NoScriptNotice />}
      </div>
    </>
  );
}

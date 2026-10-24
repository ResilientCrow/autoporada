'use client';

import { useRef, useState } from 'react';

import { users } from '@/ui/copy';
import { LiveStatus, NoScriptNotice, useFocusOnRise } from '@/ui/form';
import { SlantLabel } from '@/ui/kit';

import type { DecideAction } from './DecisionForm';
import { RequestSection, type RequestView } from './RequestSection';
import { UserFacts, type UserFactsView } from './UserFacts';

const SAID = {
  approved: users.queue.said.approved,
  rejected: users.queue.said.rejected,
  blocked: users.detail.block.said,
} as const;

/** The page's model, with its dates written out. */
export interface UserView {
  readonly user: UserFactsView & { readonly displayName: string };
  readonly request: RequestView | null;
  readonly requestEvents: readonly string[];
}

/**
 * The host of one user's page. Every section has a focusable h2: after a
 * successful write focus goes to the heading of the section that was sent (the
 * write refreshes the page, so the sections stay and only their content changes).
 */
export function UserAdmin({
  view,
  decideAccess,
}: {
  readonly view: UserView;
  readonly decideAccess: DecideAction;
}) {
  const requestHeading = useRef<HTMLHeadingElement>(null);
  const [said, setSaid] = useState({ message: '', count: 0 });
  const say = (message: string) => setSaid((s) => ({ message, count: s.count + 1 }));
  useFocusOnRise(requestHeading, said.count);
  const hasForm = view.request !== null && view.requestEvents.length > 0;
  return (
    <>
      <SlantLabel level={1}>{view.user.displayName}</SlantLabel>
      <div className="mt-4 space-y-8">
        <UserFacts user={view.user} />
        {view.request !== null && (
          <RequestSection
            request={view.request}
            events={view.requestEvents}
            decideAccess={decideAccess}
            headingRef={requestHeading}
            onDecided={(state) => say(SAID[state])}
          />
        )}
        <LiveStatus message={said.message} count={said.count} />
        {hasForm && <NoScriptNotice />}
      </div>
    </>
  );
}

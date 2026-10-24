'use client';

import { useRef, useState } from 'react';

import { users } from '@/ui/copy';
import { ArrowLink } from '@/ui/kit';
import { LiveStatus, NoScriptNotice, useFocusOnRise } from '@/ui/form';

import { DecisionForm, type DecideAction } from './DecisionForm';

/** One request waiting for the headmaster, its date written out. */
export interface QueueItemView {
  readonly requestId: string;
  readonly userId: string;
  readonly version: number;
  readonly displayName: string;
  readonly jobTitle: string | null;
  readonly department: string | null;
  readonly reason: string;
  readonly submitted: string;
  readonly events: readonly string[];
}

/**
 * „Žádosti o přístup“: the host of the decision forms. The h2 is the focus
 * target after a decision; the write refreshes the page, which drops the
 * decided item, and the status region says what happened.
 */
export function Queue({
  items,
  decideAccess,
}: {
  readonly items: readonly QueueItemView[];
  readonly decideAccess: DecideAction;
}) {
  const { queue } = users;
  const heading = useRef<HTMLHeadingElement>(null);
  const [said, setSaid] = useState({ message: '', count: 0 });
  const say = (message: string) => setSaid((s) => ({ message, count: s.count + 1 }));
  useFocusOnRise(heading, said.count);
  return (
    <section className="space-y-3">
      <h2 ref={heading} tabIndex={-1} className="text-xl">
        {queue.title}
      </h2>
      {items.length === 0 ? (
        <p>{queue.empty}</p>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => (
            <li key={item.requestId} className="space-y-2 border-b-2 border-ink pb-4">
              <p className="font-bold">{item.displayName}</p>
              {item.jobTitle !== null && <p>{item.jobTitle}</p>}
              {item.department !== null && <p>{item.department}</p>}
              <p>{queue.submitted(item.submitted)}</p>
              <p className="font-bold">{queue.reason}</p>
              <p className="break-words whitespace-pre-line">{item.reason}</p>
              <p>
                <ArrowLink href={`/uzivatele/${item.userId}`}>{users.detail.details}</ArrowLink>
              </p>
              <DecisionForm
                action={decideAccess}
                requestId={item.requestId}
                version={item.version}
                events={item.events}
                onDecided={(state) =>
                  say(state === 'approved' ? queue.said.approved : queue.said.rejected)
                }
              />
            </li>
          ))}
        </ul>
      )}
      <LiveStatus message={said.message} count={said.count} />
      {items.length > 0 && <NoScriptNotice />}
    </section>
  );
}

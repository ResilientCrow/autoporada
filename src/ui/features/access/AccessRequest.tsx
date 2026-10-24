'use client';

import { useRef, useState } from 'react';

import { access } from '@/ui/copy';
import { LiveStatus, NoScriptNotice, useFocusOnRise } from '@/ui/form';
import { SlantLabel } from '@/ui/kit';

import { CancelForm, type CancelAction } from './CancelForm';
import { RequestForm, type RequestAction } from './RequestForm';
import { headingOf, hasForm, Standing, type AccessView } from './Standing';

/**
 * The host of „Žádost o přístup“. The h2 is one persistent element, the focus
 * target after a success; the status region and the no-JavaScript notice sit
 * outside the part that changes with the state. A successful action refreshes
 * the page, so the new state arrives with the same response and the host stays.
 */
export function AccessRequest({
  view,
  requestAccess,
  cancelAccess,
}: {
  readonly view: AccessView;
  readonly requestAccess: RequestAction;
  readonly cancelAccess: CancelAction;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [said, setSaid] = useState({ message: '', count: 0 });
  const say = (message: string) => setSaid((s) => ({ message, count: s.count + 1 }));
  useFocusOnRise(heading, said.count);
  return (
    <>
      <SlantLabel level={1}>{access.title}</SlantLabel>
      <h2 ref={heading} tabIndex={-1} className="mt-4 mb-2 text-xl">
        {headingOf(view)}
      </h2>
      <div className="space-y-3">
        <Standing view={view} />
        {view.kind === 'open' && (
          <RequestForm action={requestAccess} onSent={() => say(access.said.sent)} />
        )}
        {view.kind === 'pending' && (
          <CancelForm
            action={cancelAccess}
            requestId={view.requestId}
            version={view.version}
            onCancelled={() => say(access.said.cancelled)}
          />
        )}
      </div>
      <LiveStatus message={said.message} count={said.count} />
      {hasForm(view) && <NoScriptNotice />}
    </>
  );
}

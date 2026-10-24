import type { RefObject } from 'react';

import { users } from '@/ui/copy';
import { ACCESS_LOOK, Chip } from '@/ui/status';

import { DecisionForm, type DecideAction } from './DecisionForm';

type AccessState = keyof typeof ACCESS_LOOK;

/** The newest access request of the person, its dates written out. */
export interface RequestView {
  readonly requestId: string;
  readonly version: number;
  readonly state: AccessState;
  readonly reason: string;
  readonly submitted: string;
  readonly decided: string | null;
}

/** „Žádost o přístup“: the reason, the state, and the decisions still open. */
export function RequestSection({
  request,
  events,
  decideAccess,
  headingRef,
  onDecided,
}: {
  readonly request: RequestView;
  readonly events: readonly string[];
  readonly decideAccess: DecideAction;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
  readonly onDecided: (state: 'approved' | 'rejected' | 'blocked') => void;
}) {
  const { detail, queue } = users;
  return (
    <section className="space-y-3">
      <h2 ref={headingRef} tabIndex={-1} className="text-xl">
        {detail.request}
      </h2>
      <p className="flex flex-wrap items-center gap-2">
        <Chip look={ACCESS_LOOK[request.state]} />
        <span>{queue.submitted(request.submitted)}</span>
        {request.decided !== null && <span>{detail.decided(request.decided)}</span>}
      </p>
      <p className="font-bold">{queue.reason}</p>
      <p className="break-words whitespace-pre-line">{request.reason}</p>
      <DecisionForm
        key={request.version}
        action={decideAccess}
        requestId={request.requestId}
        version={request.version}
        events={events}
        onDecided={onDecided}
      />
    </section>
  );
}

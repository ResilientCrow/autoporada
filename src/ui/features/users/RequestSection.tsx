import type { DecisionEventName } from '@/contracts';
import { users } from '@/ui/copy';
import { ACCESS_LOOK, Chip } from '@/ui/status';

import { BlockRequestForm } from './BlockRequestForm';
import { DecisionForm, type DecideAction, type Decided } from './DecisionForm';

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

/**
 * „Žádost o přístup“: the reason, the state, and the decisions still open. Both
 * forms are keyed by the request's version, each under its own name (as in UserAdmin).
 */
export function RequestSection({
  request,
  events,
  decideAccess,
  onDecided,
}: {
  readonly request: RequestView;
  readonly events: readonly DecisionEventName[];
  readonly decideAccess: DecideAction;
  readonly onDecided: (state: Decided) => void;
}) {
  const { detail, queue } = users;
  return (
    <div className="space-y-3">
      <p className="flex flex-wrap items-center gap-2">
        <Chip look={ACCESS_LOOK[request.state]} />
        <span>{queue.submitted(request.submitted)}</span>
        {request.decided !== null && (
          <span>
            {request.state === 'cancelled'
              ? detail.cancelled(request.decided)
              : detail.decided(request.decided)}
          </span>
        )}
      </p>
      <p className="font-bold">{queue.reason}</p>
      <p className="break-words whitespace-pre-line">{request.reason}</p>
      <DecisionForm
        key={`decision-${request.version}`}
        action={decideAccess}
        requestId={request.requestId}
        version={request.version}
        events={events}
        onDecided={onDecided}
      />
      {events.includes('block') && (
        <BlockRequestForm
          key={`block-${request.version}`}
          action={decideAccess}
          requestId={request.requestId}
          version={request.version}
          onBlocked={() => onDecided('blocked')}
        />
      )}
    </div>
  );
}

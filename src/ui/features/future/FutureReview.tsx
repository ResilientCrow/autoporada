'use client';

import { useState } from 'react';

import type { ReviewDecision } from '@/domain/review';
import { future } from '@/ui/copy';
import { LiveStatus, NoScriptNotice } from '@/ui/form';

import { FutureCancel } from './FutureCancel';
import { FutureDecision } from './FutureDecision';
import {
  barChoices,
  type CancelFutureAction,
  type DecideFutureAction,
  type FutureReviewModel,
} from './review-calls';

/**
 * The reviewer's side of /akce/[id] (design section 12): the decision bar and, for whoever may
 * call an approved akce off, „Zrušit akci“. It outlives the version, so its one status region is
 * mounted before a decision is said into it, while the bar and the cancel are keyed by the
 * version and start afresh after the refresh. Without JavaScript neither can send, and the page
 * says so once.
 */
export function FutureReview({
  id,
  version,
  bar,
  decideFuture,
  cancelFuture,
}: {
  readonly id: string;
  readonly version: number;
  readonly bar: FutureReviewModel;
  readonly decideFuture: DecideFutureAction;
  readonly cancelFuture: CancelFutureAction;
}) {
  const [said, setSaid] = useState({ message: '', count: 0 });
  const say = (message: string) => setSaid((s) => ({ message, count: s.count + 1 }));
  return (
    <>
      <FutureDecision
        key={`decision-${version}`}
        id={id}
        version={version}
        bar={bar}
        decideFuture={decideFuture}
        onDecided={(event: ReviewDecision) => say(future.review.said[event])}
      />
      {bar.canCancel ? (
        <FutureCancel
          key={`cancel-${version}`}
          id={id}
          version={version}
          cancelFuture={cancelFuture}
          onCancelled={() => say(future.review.cancel.said)}
        />
      ) : null}
      <LiveStatus message={said.message} count={said.count} />
      {barChoices(bar).any || bar.canCancel ? <NoScriptNotice /> : null}
    </>
  );
}

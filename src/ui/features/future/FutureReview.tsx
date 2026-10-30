'use client';

import type { ReviewDecision } from '@/domain/review';
import { future } from '@/ui/copy';
import { NoScriptNotice } from '@/ui/form';

import { FutureCancel } from './FutureCancel';
import { FutureDecision } from './FutureDecision';
import { useFutureHost } from './FutureHost';
import {
  barChoices,
  type CancelFutureAction,
  type DecideFutureAction,
  type FutureReviewModel,
} from './review-calls';

/**
 * The reviewer's side of /akce/[id] (design section 12): the decision bar and, for whoever may
 * call an approved item off, „Zrušit“. The status region and the focus belong to the `FutureHost`
 * above the views, which outlives both the version and this bar; the bar and the cancel are keyed
 * by the version and start afresh after the refresh. Without JavaScript neither can send, and the
 * page says so once.
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
  const { say } = useFutureHost();
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
      {barChoices(bar).any || bar.canCancel ? <NoScriptNotice /> : null}
    </>
  );
}

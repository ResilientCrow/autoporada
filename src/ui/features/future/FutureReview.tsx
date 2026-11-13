'use client';

import type { ReviewDecision } from '@/domain/review';
import { future } from '@/ui/copy';
import { NoScriptNotice } from '@/ui/form';

import { FutureCancel } from './FutureCancel';
import {
  FutureCancelRefuse,
  FutureCancelRequest,
  FutureCancelWaiting,
} from './FutureCancelRequest';
import { FutureDecision } from './FutureDecision';
import { useFutureHost } from './FutureHost';
import {
  barChoices,
  type CancelFutureAction,
  type DecideFutureAction,
  type FutureReviewModel,
  type RefuseCancelFutureAction,
  type RequestCancelFutureAction,
  type RetractCancelFutureAction,
} from './review-calls';

/**
 * The reviewer's side of /akce/[id] (design section 12): the decision bar and, for whoever may
 * call an approved item off, „Zrušit“ (or ask for it, or take the request back, ADR 0062). The status region and the focus belong to the `FutureHost`
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
  requestCancelFuture,
  retractCancelFuture,
  refuseCancelFuture,
  cancelRequested,
}: {
  readonly id: string;
  readonly version: number;
  readonly bar: FutureReviewModel;
  readonly decideFuture: DecideFutureAction;
  readonly cancelFuture: CancelFutureAction;
  readonly requestCancelFuture: RequestCancelFutureAction;
  readonly retractCancelFuture: RetractCancelFutureAction;
  readonly refuseCancelFuture: RefuseCancelFutureAction;
  /** A cancel request waits for the vedení (ADR 0062). */
  readonly cancelRequested: boolean;
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
          pending={cancelRequested}
          onCancelled={() => say(future.review.cancel.said)}
        />
      ) : null}
      {bar.canRefuseCancel ? (
        <FutureCancelRefuse
          key={`refuse-${version}`}
          id={id}
          version={version}
          refuseCancelFuture={refuseCancelFuture}
          onRefused={() => say(future.review.cancelRequest.refused)}
        />
      ) : null}
      {bar.canRequestCancel ? (
        <FutureCancelRequest
          key={`request-${version}`}
          id={id}
          version={version}
          requestCancelFuture={requestCancelFuture}
          onRequested={() => say(future.review.cancelRequest.said)}
        />
      ) : null}
      {bar.canRetractCancel ? (
        <FutureCancelWaiting
          key={`waiting-${version}`}
          id={id}
          version={version}
          retractCancelFuture={retractCancelFuture}
          onRetracted={() => say(future.review.cancelRequest.retracted)}
        />
      ) : null}
      {barChoices(bar).any ||
      bar.canCancel ||
      bar.canRefuseCancel ||
      bar.canRequestCancel ||
      bar.canRetractCancel ? (
        <NoScriptNotice />
      ) : null}
    </>
  );
}

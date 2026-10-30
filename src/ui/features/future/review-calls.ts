import type { z } from 'zod';

import type {
  cancelFutureInput,
  cancelFutureOutput,
  decideFutureInput,
  decideFutureOutput,
  ServerAction,
} from '@/contracts';
import { REVIEW_DECISIONS, type ReviewDecision } from '@/domain/review';
import { future, review } from '@/ui/copy';
import { choiceOf, flagOf, textOf, type FormSpec } from '@/ui/form';

export type DecideFutureAction = ServerAction<
  z.input<typeof decideFutureInput>,
  z.output<typeof decideFutureOutput>
>;
export type CancelFutureAction = ServerAction<
  z.input<typeof cancelFutureInput>,
  z.output<typeof cancelFutureOutput>
>;

/** What the page model says the bar may offer (server/pages/future-bar.ts works it out with `can()`). */
export interface FutureReviewModel {
  readonly decisions: readonly ReviewDecision[];
  /** The viewer's own item: another reviewer or the headmaster approves it. */
  readonly othersApprove: boolean;
  /** „Zrušit akci“ is offered. */
  readonly canCancel: boolean;
}

export const DECISION_FORM_ID = 'akce-rozhodnuti';
export const CANCEL_FORM_ID = 'akce-zrusit';

const { decision } = review;
/** The bar's one field: the note a return or a reject asks for (the same words as a point's). */
export const DECISION_SPEC: FormSpec = {
  note: {
    label: decision.note,
    required: true,
    messages: {
      required: decision.noteRequired,
      'too-short': decision.noteRequired,
      'too-long': decision.noteTooLong,
    },
  },
};
/** The cancel's one field: the box that must be ticked. */
export const CANCEL_SPEC: FormSpec = {
  confirmed: {
    label: future.review.cancel.confirm,
    required: true,
    messages: { required: future.review.cancel.unconfirmed },
  },
};

/** The decisions that open the note. */
export type Noted = Extract<ReviewDecision, 'return' | 'reject'>;

/** The pressed button as the action's input: an approval sends no note, a return or a reject the note as typed. */
export function decideInput(id: string, version: number, data: FormData) {
  const event = choiceOf(data, 'decision', REVIEW_DECISIONS);
  const write = { id, expectedVersion: version };
  if (event === 'return' || event === 'reject') {
    return { ...write, event, note: textOf(data, 'note') };
  }
  return { ...write, event };
}

/** „Zrušit akci“: the box as ticked; an empty one is for the server to refuse, writing nothing. */
export const cancelInput = (id: string, version: number, data: FormData) => ({
  id,
  expectedVersion: version,
  confirmed: flagOf(data, 'confirmed'),
});

/** Which parts of the bar show. The cancel has a form of its own and is no part of it. */
export function barChoices({ decisions, othersApprove }: FutureReviewModel) {
  return {
    approve: decisions.includes('approve'),
    return: decisions.includes('return'),
    reject: decisions.includes('reject'),
    ownItem: othersApprove,
    any: decisions.length > 0 || othersApprove,
  };
}

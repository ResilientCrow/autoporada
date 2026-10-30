import type { z } from 'zod';

import type { decidePointInput, decidePointOutput, ServerAction } from '@/contracts';
import type { ReviewDecision } from '@/domain/review';
import { review } from '@/ui/copy';
import { choiceOf, textOf, type FormSpec } from '@/ui/form';

export type DecidePointAction = ServerAction<
  z.input<typeof decidePointInput>,
  z.output<typeof decidePointOutput>
>;

/** What the page model says the bar may offer (server/pages/review.ts works it out with `can()`). */
export interface DecisionBarModel {
  readonly decisions: readonly ReviewDecision[];
  /** The viewer's own point: another reviewer or the headmaster approves it. */
  readonly othersApprove: boolean;
}

export const DECISION_FORM_ID = 'kontrola-rozhodnuti';
/** The point's title on /kontrola/[id]: where focus goes after a decision. */
export const REVIEW_HEADING_ID = 'kontrola-bod';
const { decision } = review;
/** The bar's one field: the note a return or a reject asks for. */
export const DECISION_SPEC: FormSpec = {
  note: {
    label: decision.note,
    required: true,
    messages: { required: decision.noteRequired, 'too-long': decision.noteTooLong },
  },
};

/** The submit buttons' values: the decisions, and „Schválit a pokračovat“. */
export const PRESSES = ['approve', 'approve-next', 'return', 'reject'] as const;
export type Press = (typeof PRESSES)[number];
/** The decisions that open the note. */
export type Noted = Extract<ReviewDecision, 'return' | 'reject'>;

/** Which parts of the bar show; „Upravit“ only where the page gives the reviewer's editor (`canEdit`). */
export function barChoices({ decisions, othersApprove }: DecisionBarModel, canEdit = false) {
  return {
    approve: decisions.includes('approve'),
    return: decisions.includes('return'),
    reject: decisions.includes('reject'),
    ownPoint: othersApprove,
    edit: canEdit,
    any: decisions.length > 0 || othersApprove || canEdit,
  };
}

/** The pressed button as the action's input: an approval sends no note, a return or a reject the note as typed. */
export function decideInput(id: string, version: number, data: FormData) {
  const press = choiceOf(data, 'decision', PRESSES);
  const write = { id, expectedVersion: version };
  if (press === 'return' || press === 'reject') {
    return { ...write, event: press, note: textOf(data, 'note') };
  }
  return { ...write, event: 'approve' as const };
}

/** The decision a press made: „Schválit a pokračovat“ is an approval. */
export const decidedEvent = (press: Press): ReviewDecision =>
  press === 'approve-next' ? 'approve' : press;

const BAR = 'submit-bar border-t-2 border-ink bg-light py-3';
/**
 * The bar's box. From md on the closed bar is one row of buttons, which fits the room `bar-room`
 * keeps clear, so it sticks to the bottom; narrower, or with the note open, it is taller than that
 * room and would cover what focus brings into view, so it sits in the flow above the history.
 */
export const barClass = (noted: Noted | null): string =>
  noted === null ? `${BAR} md:sticky md:bottom-0 md:z-10` : BAR;

/** Where a decision that went through leads: „Schválit a pokračovat“ to the next point or the queue, else nowhere. */
export function afterDecision(press: Press, next: string | null): string | null {
  if (press !== 'approve-next') return null;
  return next === null ? '/kontrola' : `/kontrola/${next}`;
}

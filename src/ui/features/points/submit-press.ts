import type { SummaryEntry, SaveAnswer } from '@/ui/form';

import { NO_OUTCOME, type SubmitOutcome } from './submit-outcome';

/** What the last press left on the page, and a count for each lead that takes focus when it rises. */
export interface Shown {
  readonly outcome: SubmitOutcome;
  /** Rises with each summary of fields: the panel's error summary takes focus. */
  readonly summaryAttempt: number;
  /** Rises with each problem of the form: the form's lead takes focus. Apart from the summary's count, so a press with problems never also moves focus to a refusal's problem. */
  readonly problemAttempt: number;
}

export const NOTHING_SHOWN: Shown = { outcome: NO_OUTCOME, summaryAttempt: 0, problemAttempt: 0 };

/** The page after `outcome` is shown: the count of whichever lead it sets rises. */
export function withOutcome(previous: Shown, outcome: SubmitOutcome): Shown {
  return {
    outcome,
    summaryAttempt: previous.summaryAttempt + (outcome.summary === null ? 0 : 1),
    problemAttempt: previous.problemAttempt + (outcome.problem === null ? 0 : 1),
  };
}

export type Press =
  | { readonly kind: 'ignore' }
  | { readonly kind: 'show'; readonly entries: readonly SummaryEntry[] }
  | { readonly kind: 'send' };

/**
 * What a press of „Odeslat ke kontrole“ does: nothing while a send is on its way; with problems
 * found now, show them (the client's own check, no call); with none, send.
 */
export function pressDecision(sending: boolean, problems: readonly SummaryEntry[]): Press {
  if (sending) return { kind: 'ignore' };
  return problems.length > 0 ? { kind: 'show', entries: problems } : { kind: 'send' };
}

/** The fields hold still for a banner and for a send in flight: text typed after the press would be flushed against a stale version and lost. */
export function readOnlyWhile(held: boolean, sending: boolean): boolean {
  return held || sending;
}

export interface PressPorts {
  readonly sending: boolean;
  readonly problems: readonly SummaryEntry[];
  readonly show: (outcome: SubmitOutcome) => void;
  readonly setSending: (sending: boolean) => void;
  readonly send: () => Promise<SaveAnswer | null>;
}

/**
 * One press. A send that went through stays pending until the page refreshes; a banner (null),
 * a failure, a conflict or a refusal ends it.
 */
export async function runPress(ports: PressPorts): Promise<void> {
  const decision = pressDecision(ports.sending, ports.problems);
  if (decision.kind === 'ignore') return;
  if (decision.kind === 'show') return ports.show({ summary: decision.entries, problem: null });
  ports.show(NO_OUTCOME);
  ports.setSending(true);
  const answer = await ports.send();
  if (answer?.kind !== 'ok') ports.setSending(false);
}

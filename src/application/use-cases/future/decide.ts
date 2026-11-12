import { defineUseCase, ok } from '@/application/core';
import { decideFutureInput, decideFutureOutput } from '@/contracts';
import type { ReviewDecision } from '@/domain/review';

import { futureDecisionAccess } from './access';
import { decideMove, moveCheck } from './events';

/** What the access check reads of the input: the item, the version, the decision. */
interface Decided {
  readonly id: string;
  readonly expectedVersion: number;
  readonly event: ReviewDecision;
}

/**
 * „Schválit“, „Vrátit k úpravě“, „Zamítnout“ (design section 12): a reviewer's decision on a
 * handed-in akce or jednání, or a return or reject of an approved akce. The machine's `approver`
 * keeps a reviewer from approving their own item (the headmaster may); a return or a reject carries
 * the note and the parts to rework for the author into the history event (every part fits an akce
 * and a jednání alike, so the contract's list is the whole check). Only the state moves: the author's text stays.
 * The author reads the outcome in the app: no mail is queued.
 */
export const decideFuture = defineUseCase({
  name: 'future.decide',
  mode: 'write',
  input: decideFutureInput,
  output: decideFutureOutput,
  access: futureDecisionAccess<Decided>((item, { event }) => moveCheck(event)(item)),
  async execute({ tx }, { event, note, parts }, item) {
    const after = await decideMove(tx, item, event, note, parts);
    return ok({ version: after.version });
  },
});

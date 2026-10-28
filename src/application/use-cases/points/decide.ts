import { defineUseCase, ok } from '@/application/core';
import { decidePointInput, decidePointOutput } from '@/contracts';
import type { ReviewDecision } from '@/domain/review';

import { pointWriteAccess } from './access';
import { move, moveCheck } from './append-event';
import { nextInQueue } from './queue';

/** What the access check reads of the input: the point, the version, the decision. */
interface Decided {
  readonly id: string;
  readonly expectedVersion: number;
  readonly event: ReviewDecision;
}

/**
 * „Schválit“, „Vrátit k úpravě“, „Zamítnout“ (design section 10): a reviewer's decision on a
 * handed-in point. The machine's `approver` keeps a reviewer from approving their own point (the
 * headmaster may); a return or a reject carries the note for the author into the point event. The
 * answer names the queue's next submitted point this actor may approve, as the queue stands after
 * the decision, for „Schválit a pokračovat“.
 */
export const decidePoint = defineUseCase({
  name: 'points.decide',
  mode: 'write',
  input: decidePointInput,
  output: decidePointOutput,
  access: pointWriteAccess<Decided>((point, { event }) => moveCheck(event)(point)),
  async execute({ tx, now, actor }, { event, note }, point) {
    const after = await move(tx, point, event, note === undefined ? {} : { note });
    return ok({ version: after.version, next: await nextInQueue(tx, now, actor) });
  },
});

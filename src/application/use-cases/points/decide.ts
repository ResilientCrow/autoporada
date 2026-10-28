import { defineUseCase, ok } from '@/application/core';
import { mailJob, POINT_MAIL } from '@/application/notifications';
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
 * the decision, for „Schválit a pokračovat“. The author's mail is queued in the same transaction
 * (ADR 0020), about the event the decision appended, unless the author decided it themselves.
 */
export const decidePoint = defineUseCase({
  name: 'points.decide',
  mode: 'write',
  input: decidePointInput,
  output: decidePointOutput,
  access: pointWriteAccess<Decided>((point, { event }) => moveCheck(event)(point)),
  async execute({ tx, now, actor }, { event, note }, point) {
    const { after, eventId } = await move(tx, point, event, note === undefined ? {} : { note });
    // Nobody is mailed about their own decision on their own point (the headmaster's approval, a
    // reviewer's return or reject).
    if (point.authorId !== actor.id) {
      const mail = mailJob(POINT_MAIL[event], { authorId: point.authorId, eventId });
      await tx.jobs.enqueue('mail.send', mail.data, { dedupeKey: mail.dedupeKey });
    }
    return ok({ version: after.version, next: await nextInQueue(tx, now, actor) });
  },
});

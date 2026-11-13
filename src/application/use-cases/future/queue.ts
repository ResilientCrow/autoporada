import { defineUseCase, ok } from '@/application/core';
import { futureContentToView, QUEUE_LIMIT, queueFutureInput, queueFutureOutput } from '@/contracts';

/**
 * „Kontrola“, the akce and jednání section (design section 12): the handed-in items in the
 * reviewer's scope and the approved ones whose author asked to cancel them („Žádost o zrušení“,
 * ADR 0062), the oldest hand-in or request first. Drafts are never in a reviewer's scope, and any
 * other approved, returned, rejected, withdrawn or cancelled item is not waiting here.
 */
export const queueFuture = defineUseCase({
  name: 'future.queue',
  mode: 'read',
  input: queueFutureInput,
  output: queueFutureOutput,
  access: { kind: 'gate', check: () => ({ action: 'review.queue' }) },
  async execute({ tx }) {
    // One row past the limit tells whether more wait than the queue lists.
    const read = await tx.futureItems.queue(QUEUE_LIMIT + 1);
    const items = read.slice(0, QUEUE_LIMIT).flatMap(({ item, revised }) => {
      // A submitted item has its hand-in instant (a CHECK on the table); the type does not know.
      if (item.submittedAt === null) return [];
      const { title, startDate, endDate } = futureContentToView(item.content);
      return [
        {
          id: item.id,
          kind: item.kind,
          title,
          startDate,
          endDate,
          submittedAt: item.submittedAt.toISOString(),
          cancelRequestedAt: item.cancelRequestedAt?.toISOString() ?? null,
          revised,
        },
      ];
    });
    return ok({ items, more: read.length > QUEUE_LIMIT });
  },
});

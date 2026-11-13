import { defineUseCase, ok } from '@/application/core';
import {
  futureContentToView,
  futureContentToWire,
  getFutureInput,
  getFutureOutput,
} from '@/contracts';
import { can } from '@/domain/policy';

import { futureReadAccess } from './access';

/**
 * One item for /akce/[id] (design section 12): the editor's content and where
 * it stands. Only the author and readers whose scope holds the item reach it;
 * anyone else gets not-found. The history, with a reviewer's notes, is for
 * the author and reviewers: a colleague who sees an approved akce does not
 * see it. It names no one. Only the author gets the content as they wrote
 * it; a reader gets the names-only `view` the list shows. A pending cancel request, like the
 * history, is for the author and reviewers only.
 */
export const getFuture = defineUseCase({
  name: 'future.get',
  mode: 'read',
  input: getFutureInput,
  output: getFutureOutput,
  access: futureReadAccess(),
  async execute({ tx, actor }, _input, item) {
    const isAuthor = item.authorId === actor.id;
    const sees = isAuthor || can(actor, { action: 'review.queue' });
    const events = sees ? await tx.futureEvents.list(item.id) : [];
    return ok({
      id: item.id,
      kind: item.kind,
      state: item.state,
      version: item.version,
      isAuthor,
      editable:
        isAuthor &&
        can(actor, {
          action: 'future.edit',
          item: {
            isAuthor,
            state: item.state,
            kind: item.kind,
            cancelRequested: item.cancelRequestedAt !== null,
          },
        }),
      updatedAt: item.updatedAt.toISOString(),
      submittedAt: item.submittedAt?.toISOString() ?? null,
      reportState: item.reportState,
      reportPointId: item.reportPointId,
      // Between the author and the vedení, as the history is (ADR 0062).
      cancelRequestedAt: sees ? (item.cancelRequestedAt?.toISOString() ?? null) : null,
      // The editor needs the whole content, so only its author gets it; anyone else the names.
      content: isAuthor ? futureContentToWire(item.content) : null,
      view: futureContentToView(item.content),
      timeline: events.map((event) => ({
        event: event.event,
        fromState: event.fromState,
        toState: event.toState,
        note: event.note,
        parts: event.returnParts && [...event.returnParts],
        editedFields: event.editedFields && [...event.editedFields],
        createdAt: event.createdAt.toISOString(),
      })),
    });
  },
});

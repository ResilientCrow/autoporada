import { defineUseCase, ok } from '@/application/core';
import { contentWire, getPointInput, getPointOutput } from '@/contracts';
import { toIsoDate } from '@/domain/time';

import { pointReadAccess, pointStanding } from './access';

/**
 * One point for /body/[id] (design section 6): the editor's content and the
 * spec of its type, or the read view with the timeline. Only the author and
 * readers whose scope holds the point reach it; anyone else gets not-found.
 * The timeline names no one; a review edit's previous values („Původní
 * znění“) join it with the review edit (design row 40).
 */
export const getPoint = defineUseCase({
  name: 'points.get',
  mode: 'read',
  input: getPointInput,
  output: getPointOutput,
  access: pointReadAccess(),
  async execute({ tx, actor }, _input, point) {
    // A retired type still names its spec and title gender: the editor needs both.
    const type = point.typeId === null ? null : await tx.pointTypes.get(point.typeId);
    const events = await tx.pointEvents.list(point.id);
    return ok({
      id: point.id,
      kind: point.kind,
      ...pointStanding(point, actor.id),
      updatedAt: point.updatedAt.toISOString(),
      earliestMonday: point.earliestMonday && toIsoDate(point.earliestMonday),
      submittedAt: point.submittedAt?.toISOString() ?? null,
      isAuthor: point.authorId === actor.id,
      content: contentWire(point.content),
      type: type && {
        id: type.id,
        name: type.name,
        titleGender: type.titleGender,
        defaultBullets: [...type.defaultBullets],
      },
      timeline: events.map((event) => ({
        event: event.event,
        fromState: event.fromState,
        toState: event.toState,
        note: event.note,
        editedFields: event.editedFields && [...event.editedFields],
        createdAt: event.createdAt.toISOString(),
      })),
    });
  },
});

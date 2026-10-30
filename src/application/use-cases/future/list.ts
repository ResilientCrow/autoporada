import { defineUseCase, ok } from '@/application/core';
import type { FutureItemRecord } from '@/application/ports';
import { FUTURE_LIST_PAGE, listFutureInput, listFutureOutput } from '@/contracts';
import { displayName } from '@/domain/report';
import { toIsoDate, toIsoTime } from '@/domain/time';

const rowWire = (item: FutureItemRecord, readerId: string) => {
  const { content } = item;
  const { responsible } = content;
  return {
    id: item.id,
    kind: item.kind,
    state: item.state,
    isAuthor: item.authorId === readerId,
    title: content.title,
    startDate: content.startDate && toIsoDate(content.startDate),
    endDate: content.endDate && toIsoDate(content.endDate),
    timeFrom: content.timeFrom && toIsoTime(content.timeFrom),
    timeTo: content.timeTo && toIsoTime(content.timeTo),
    campus: content.campus,
    place: content.place,
    expectsReport: content.expectsReport,
    // The list names who is responsible and shows nothing else about them.
    responsible: responsible && {
      verb: responsible.verb,
      behalfOf: responsible.behalfOf ?? null,
      names: responsible.people.map(displayName),
    },
    updatedAt: item.updatedAt.toISOString(),
  };
};

/**
 * „Akce“ (design section 12): what the reader may see, last changed first, one
 * page. The scope decides: the author's own items in any state, every
 * approved akce, and for reviewers what was handed in. One item more than a
 * page is read, so `more` is true only when there is one.
 */
export const listFuture = defineUseCase({
  name: 'future.list',
  mode: 'read',
  input: listFutureInput,
  output: listFutureOutput,
  access: { kind: 'gate', check: () => ({ action: 'future.create' }) },
  async execute({ tx, actor }) {
    const read = await tx.futureItems.list(FUTURE_LIST_PAGE + 1);
    return ok({
      items: read.slice(0, FUTURE_LIST_PAGE).map((item) => rowWire(item, actor.id)),
      more: read.length > FUTURE_LIST_PAGE,
    });
  },
});

import { defineUseCase, ok } from '@/application/core';
import type { FutureItemRecord } from '@/application/ports';
import {
  cursorText,
  futureContentToView,
  FUTURE_LIST_PAGE,
  listFutureInput,
  listFutureOutput,
} from '@/contracts';

const rowWire = (item: FutureItemRecord, readerId: string) => ({
  id: item.id,
  kind: item.kind,
  state: item.state,
  isAuthor: item.authorId === readerId,
  // The list names who is responsible and shows nothing else about them.
  ...futureContentToView(item.content),
  updatedAt: item.updatedAt.toISOString(),
});

/**
 * „Akce“ (design section 12): what the reader may see, last changed first, a
 * page at a time. The scope decides: the author's own items in any state,
 * every approved akce, and for reviewers what was handed in. One item more
 * than a page is read: only when it exists is there an older page, and its
 * cursor is the page's last row.
 */
export const listFuture = defineUseCase({
  name: 'future.list',
  mode: 'read',
  input: listFutureInput,
  output: listFutureOutput,
  access: { kind: 'gate', check: () => ({ action: 'future.create' }) },
  async execute({ tx, actor }, { before }) {
    const read = await tx.futureItems.list(FUTURE_LIST_PAGE + 1, before);
    const rows = read.slice(0, FUTURE_LIST_PAGE);
    const last = read.length > FUTURE_LIST_PAGE ? rows.at(-1) : undefined;
    return ok({
      items: rows.map((item) => rowWire(item, actor.id)),
      next: last ? cursorText(last) : null,
    });
  },
});

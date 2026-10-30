import type { z } from 'zod';

import { getFuture, listFuture } from '@/application/use-cases';
import type { getFutureOutput, listFutureOutput } from '@/contracts';
import type { FutureState } from '@/domain/review';

import { getContainer } from '../container';
import { runRegistered } from '../pipeline';

import { orNotFound } from './not-found';
import { first, type SearchParams } from './params';
import { readWindow, type MeetingWindow } from './standing';
import { getViewer, requestId } from './viewer';

export interface FutureListPageModel {
  readonly rows: z.output<typeof listFutureOutput>['items'];
  /** The cursor „Starší akce“ continues from; null on the last page. */
  readonly next: string | null;
  /** False on a page after a cursor: an empty one there is not a school with no akce. */
  readonly first: boolean;
}

/**
 * „Akce“: what the reader may see, last changed first, one page. `?pred` is the cursor the page
 * before it ended at; a malformed one is a 404, like a malformed id.
 */
export async function futureListPage(params: SearchParams): Promise<FutureListPageModel | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  const before = first(params['pred']);
  const listed = orNotFound(
    'future.list',
    await runRegistered(getContainer(), listFuture, {
      principal: viewer,
      requestId: await requestId(),
      input: before === undefined ? {} : { before },
    }),
  );
  return listed && { rows: listed.items, next: listed.next, first: before === undefined };
}

/** The states an item is still going somewhere from: the others are over. */
const GOING: readonly FutureState[] = ['draft', 'returned', 'submitted', 'approved'];

export interface FuturePageModel {
  readonly id: string;
  readonly kind: z.output<typeof getFutureOutput>['kind'];
  readonly state: z.output<typeof getFutureOutput>['state'];
  readonly version: number;
  readonly isAuthor: boolean;
  readonly editable: boolean;
  readonly view: z.output<typeof getFutureOutput>['view'];
  /** Only for the author of an item that is still going somewhere, with a start date; else null. */
  readonly window: MeetingWindow | null;
}

/**
 * One item's page, or null for a visitor or a refusal, a malformed id and an unknown or
 * unseen item included (404). The meeting calendar is read only for the strip, and a
 * refusal of it leaves the strip out: it is a convenience.
 */
export async function futurePage(id: string): Promise<FuturePageModel | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  const loaded = orNotFound(
    'future.get',
    await runRegistered(getContainer(), getFuture, {
      principal: viewer,
      requestId: await requestId(),
      input: { id },
    }),
  );
  if (loaded === null) return null;
  const { kind, state, version, isAuthor, editable, view } = loaded;
  const strip = isAuthor && view.startDate !== null && GOING.includes(state);
  return {
    id: loaded.id,
    kind,
    state,
    version,
    isAuthor,
    editable,
    view,
    window: strip ? await readWindow(viewer) : null,
  };
}

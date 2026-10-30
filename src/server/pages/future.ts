import type { z } from 'zod';

import { getFuture, listFuture } from '@/application/use-cases';
import type { getFutureOutput, listFutureOutput } from '@/contracts';
import type { FutureKind } from '@/domain/calendar';
import type { RecentPerson } from '@/domain/people';
import { can } from '@/domain/policy';
import type { FutureState } from '@/domain/review';
import { instantToWallClock, type CalDate } from '@/domain/time';

import { getContainer } from '../container';
import { runRegistered } from '../pipeline';

import { orNotFound } from './not-found';
import { first, type SearchParams } from './params';
import { recentsOf } from './recents';
import { readWindow, type MeetingWindow } from './standing';
import { getViewer, requestId } from './viewer';

export interface FutureListPageModel {
  readonly rows: z.output<typeof listFutureOutput>['items'];
  /** The cursor „Starší akce“ continues from; null on the last page. */
  readonly next: string | null;
  /** False on a page after a cursor: an empty one there is not a school with no akce. */
  readonly first: boolean;
  /** The reader may start a new item („Nová akce“). */
  readonly canCreate: boolean;
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
  return (
    listed && {
      rows: listed.items,
      next: listed.next,
      first: before === undefined,
      canCreate: can(viewer.actor, { action: 'future.create' }),
    }
  );
}

/** The states an item is still going somewhere from: the others are over. */
const GOING: readonly FutureState[] = ['draft', 'returned', 'submitted', 'approved'];

/** The kinds a new item can start as, in the order the chooser lists them. */
const KINDS: readonly FutureKind[] = ['akce', 'jednani'];

/** What /akce/novy offers: the kinds a new item can start as. */
export interface NewFuturePageModel {
  readonly kinds: readonly FutureKind[];
}

/** The kinds to choose from, or null for a visitor or a viewer who may not start an item (404). */
export async function newFuturePage(): Promise<NewFuturePageModel | null> {
  const viewer = await getViewer();
  if (!viewer || !can(viewer.actor, { action: 'future.create' })) return null;
  return { kinds: KINDS };
}

/**
 * What the editor starts from: the version it was loaded at (its key and the first
 * `expectedVersion`), the content as the save takes it back, the Prague day the date fields
 * count from, the people the author named in their recent points and whether the school
 * directory is searched at all.
 */
interface FutureEditorModel {
  readonly version: number;
  readonly content: NonNullable<z.output<typeof getFutureOutput>['content']>;
  readonly today: CalDate;
  readonly recents: readonly RecentPerson[];
  readonly directory: 'on' | 'off';
}

export interface FuturePageModel {
  readonly id: string;
  readonly kind: z.output<typeof getFutureOutput>['kind'];
  readonly state: z.output<typeof getFutureOutput>['state'];
  readonly version: number;
  readonly isAuthor: boolean;
  readonly editable: boolean;
  readonly view: z.output<typeof getFutureOutput>['view'];
  /** The author may take a submitted item back („Stáhnout“). */
  readonly canRetract: boolean;
  /** What the reviewer wrote when they returned the item: only while it stands returned, else null. */
  readonly returnNote: string | null;
  /** Only for the author of a draft, returned or approved item: what the editor opens with. */
  readonly editor: FutureEditorModel | null;
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
  const { kind, state, version, isAuthor, editable, view, content, timeline } = loaded;
  const strip = isAuthor && view.startDate !== null && GOING.includes(state);
  const shows = editable && content !== null;
  // Independent reads, each only where its part of the page shows.
  const [window, recents] = await Promise.all([
    strip ? readWindow(viewer) : null,
    shows ? recentsOf(viewer) : [],
  ]);
  return {
    id: loaded.id,
    kind,
    state,
    version,
    isAuthor,
    editable,
    view,
    canRetract:
      isAuthor &&
      can(viewer.actor, {
        action: 'future.transition',
        item: { isAuthor, state, kind },
        event: 'retract',
      }),
    // The timeline is newest first: the latest return is the one the author answers.
    returnNote:
      state === 'returned' ? (timeline.find((e) => e.event === 'return')?.note ?? null) : null,
    editor: shows
      ? {
          version,
          content,
          today: instantToWallClock(getContainer().app.clock.now()).date,
          recents,
          directory: getContainer().directoryMode,
        }
      : null,
    window,
  };
}

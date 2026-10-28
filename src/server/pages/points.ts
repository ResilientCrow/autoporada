import type { z } from 'zod';

import { getPoint, listMyPoints, listPointTypes } from '@/application/use-cases';
import { toKnownIssues, type listMyPointsOutput, type listPointTypesOutput } from '@/contracts';
import { placementMonday } from '@/domain/calendar';
import { schoolYear, type TitleGender } from '@/domain/cs';
import type { RecentPerson } from '@/domain/people';
import type { BulletSpec } from '@/domain/report';
import type { Actor } from '@/domain/actor';
import { can } from '@/domain/policy';
import { authorEditsPoint, type AuthorMove, type PointState } from '@/domain/review';
import { instantToWallClock, parseIsoDate, toIsoDate, type CalDate } from '@/domain/time';

import { getContainer } from '../container';
import { runRegistered } from '../pipeline';

import { orNotFound } from './not-found';
import { first, type SearchParams } from './params';
import { pointView, type LoadedPoint, type PointViewModel } from './point-view';
import { recentsOf } from './recents';
import { readWindow, standingOf, type MeetingWindow, type StandingModel } from './standing';
import { getViewer, requestId } from './viewer';

/** What /body/novy offers: the types a new point can start on. */
export interface NewPointPageModel {
  readonly types: z.output<typeof listPointTypesOutput>['types'];
}

/** The types to choose from, or null for a visitor or a viewer who may not start a point (404). */
export async function newPointPage(): Promise<NewPointPageModel | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  const listed = orNotFound(
    'pointTypes.list',
    await runRegistered(getContainer(), listPointTypes, {
      principal: viewer,
      requestId: await requestId(),
      input: {},
    }),
  );
  return listed && { types: listed.types };
}

/**
 * What the report editor starts from: the version it was loaded at (its key and the
 * first `expectedVersion`), the content as the save takes it back, the bullets its type
 * offers (which may be removed), its title gender (the opening sentence agrees with it),
 * the Prague day the picker counts the school year from and that school year (the one submit checks the classes
 * against: today's, apart from the preview's, which is the placement's), the people the author named in
 * their recent points, and whether the school directory is searched at all.
 */
interface PointEditorModel {
  readonly version: number;
  readonly content: LoadedPoint['content'];
  readonly spec: readonly BulletSpec[];
  readonly titleGender: TitleGender | null;
  readonly today: CalDate;
  readonly readinessSchoolYear: string;
  readonly recents: readonly RecentPerson[];
  readonly directory: 'on' | 'off';
}

/**
 * What a point's header and read view show, dates and times written out, and what
 * the editor needs, only while it is shown (the author, a draft or returned point).
 * The read view's content is null where the editor shows (an editable report): it holds the content.
 */
export interface PointPageModel extends PointViewModel<LoadedPoint['content'] | null> {
  /** Only for the author of a draft or returned point: where it will go and when that closes; null if no porada is open. */
  readonly standing: StandingModel | null;
  /** The buttons the author may press from this state (`availableEvents` for them); none for anyone else. */
  readonly moves: readonly AuthorMove[];
  /** Null unless the viewer is the author and the point can still be edited. */
  readonly editor: PointEditorModel | null;
}

function shaped(
  loaded: LoadedPoint,
  extra: {
    readonly recents: readonly RecentPerson[];
    readonly today: CalDate;
    readonly standing: StandingModel | null;
    readonly moves: readonly AuthorMove[];
  },
): PointPageModel {
  const { recents, today, standing, moves } = extra;
  const { kind, type, content, version, editable } = loaded;
  const view = pointView(loaded, today);
  return {
    ...view,
    standing,
    moves,
    // The editor carries the content when it shows: the page does not send it twice.
    read: { ...view.read, content: editable && kind === 'report' ? null : content },
    editor: editable
      ? {
          version,
          content,
          spec: type?.defaultBullets ?? [],
          titleGender: type?.titleGender ?? null,
          today,
          readinessSchoolYear: schoolYear(today),
          recents,
          directory: getContainer().directoryMode,
        }
      : null,
  };
}

const AUTHOR_MOVES: readonly AuthorMove[] = ['retract', 'withdraw'];

/** What the author may press from this state, as the policy allows; nothing for anyone else. */
function movesOf(actor: Actor, { state, isAuthor }: LoadedPoint): readonly AuthorMove[] {
  if (!isAuthor) return [];
  const point = { state, isAuthor };
  return AUTHOR_MOVES.filter((event) => can(actor, { action: 'point.transition', point, event }));
}

/**
 * One point's page, or null for a visitor or a refusal, a malformed id and an unknown or
 * foreign point included (404). The recent people are read only when the editor shows, and the
 * meeting calendar only for the author of a draft or returned point.
 */
export async function pointPage(id: string): Promise<PointPageModel | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  const loaded = orNotFound(
    'points.get',
    await runRegistered(getContainer(), getPoint, {
      principal: viewer,
      requestId: await requestId(),
      input: { id },
    }),
  );
  if (loaded === null) return null;
  const now = getContainer().app.clock.now();
  const today = instantToWallClock(now).date;
  // Independent reads, each only where its part of the page shows.
  const [recents, standing] = await Promise.all([
    loaded.editable ? recentsOf(viewer) : [],
    loaded.isAuthor && authorEditsPoint(loaded.state) ? standingOf(viewer, now) : null,
  ]);
  const moves = movesOf(viewer.actor, loaded);
  return shaped(loaded, { recents, today, standing, moves });
}

/** A line of „Moje body“, as the page draws it. */
interface MyPointItem {
  readonly id: string;
  readonly state: PointState;
  /** Empty while the author has not named the point. */
  readonly title: string;
  /** The first line of the note a returned point came back with. */
  readonly returnNote: string | null;
  /** The Monday an approved point goes to the porada from, ISO; null for any other point or when no porada of the window is open. */
  readonly placement: string | null;
}

export interface MyPointsPageModel {
  readonly rows: readonly MyPointItem[];
  /** The cursor „Starší body“ continues from; null on the last page. */
  readonly next: string | null;
  /** False on a page after a cursor: an empty one there is not an author with no points. */
  readonly first: boolean;
}

/** Where an approved point goes: its earliest Monday, or the next one once that porada is over (design section 3). */
function placementOf(
  { state, earliestMonday }: z.output<typeof listMyPointsOutput>['points'][number],
  window: MeetingWindow | null,
  now: Date,
): string | null {
  if (state !== 'approved' || earliestMonday === null || window === null) return null;
  const known = toKnownIssues(window.issues);
  const monday = placementMonday(parseIsoDate(earliestMonday), now, known);
  return monday && toIsoDate(monday);
}

/**
 * „Moje body“: the author's points, last changed first, one page. `?pred` is the cursor the
 * page before it ended at; a malformed one is a 404, like a malformed id. The meeting calendar
 * is read only when a point is approved, and a refusal of it leaves the dates out.
 */
export async function myPointsPage(params: SearchParams): Promise<MyPointsPageModel | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  const before = first(params['pred']);
  const listed = orNotFound(
    'points.listMine',
    await runRegistered(getContainer(), listMyPoints, {
      principal: viewer,
      requestId: await requestId(),
      input: before === undefined ? {} : { before },
    }),
  );
  if (listed === null) return null;
  const window = listed.points.some((point) => point.state === 'approved')
    ? await readWindow(viewer)
    : null;
  const now = getContainer().app.clock.now();
  return {
    rows: listed.points.map((point) => ({
      id: point.id,
      state: point.state,
      title: point.title,
      returnNote: point.returnNote,
      placement: placementOf(point, window, now),
    })),
    next: listed.next,
    first: before === undefined,
  };
}

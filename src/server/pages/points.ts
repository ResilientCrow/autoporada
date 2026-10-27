import type { z } from 'zod';

import { getPoint, listPointTypes } from '@/application/use-cases';
import type { getPointOutput, listPointTypesOutput } from '@/contracts';
import { formatLongDate, formatTime, type Campus } from '@/domain/cs';
import type { PointKind } from '@/domain/report';
import type { PointState } from '@/domain/review';
import { parseIsoDate, parseWallTime } from '@/domain/time';

import { getContainer } from '../container';
import { runRegistered } from '../pipeline';

import { orNotFound } from './not-found';
import { getViewer, requestId } from './viewer';

type Loaded = z.output<typeof getPointOutput>;

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
 * first `expectedVersion`) and the content as the save takes it back.
 */
interface PointEditorModel {
  readonly version: number;
  readonly content: Loaded['content'];
}

/**
 * What a point's header and read view show, dates and times written out, and what
 * the editor needs, only while it is shown (the author, a draft or returned point).
 */
export interface PointPageModel {
  readonly id: string;
  readonly kind: PointKind;
  readonly state: PointState;
  /** Empty while the author has not named the point. */
  readonly title: string;
  /** A report's type; null for finance and pokyn. */
  readonly typeName: string | null;
  readonly facts: {
    readonly eventDate: string | null;
    readonly endDate: string | null;
    readonly timeFrom: string | null;
    readonly timeTo: string | null;
    readonly campus: Campus | null;
    readonly place: string | null;
  };
  /** Null unless the viewer is the author and the point can still be edited. */
  readonly editor: PointEditorModel | null;
}

const dateText = (iso: string | null) => (iso === null ? null : formatLongDate(parseIsoDate(iso)));
const timeText = (iso: string | null) => (iso === null ? null : formatTime(parseWallTime(iso)));

function shaped({ id, kind, state, type, content, version, editable }: Loaded): PointPageModel {
  return {
    id,
    kind,
    state,
    title: content.title,
    typeName: type?.name ?? null,
    facts: {
      eventDate: dateText(content.eventDate),
      endDate: dateText(content.endDate),
      timeFrom: timeText(content.timeFrom),
      timeTo: timeText(content.timeTo),
      campus: content.campus,
      place: content.place?.trim() || null,
    },
    editor: editable ? { version, content } : null,
  };
}

/** One point's page, or null for a visitor or a refusal, a malformed id and an unknown or foreign point included (404). */
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
  return loaded && shaped(loaded);
}

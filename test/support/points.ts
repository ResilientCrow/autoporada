/**
 * Points for the use-case tests of submit, retract and withdraw: a point
 * started through `points.create`, content a submit accepts, and a state
 * reached past the use cases where no use case leads there yet.
 */
import { randomUUID } from 'node:crypto';

import { system, type UserRecord } from '@/application/ports';
import { createPoint } from '@/application/use-cases';
import type { BulletSpec, PointKind } from '@/domain/report';
import type { PointState } from '@/domain/review';
import { calDate, parseIsoDate } from '@/domain/time';

import type { World } from './world';
import { CLOCK_START } from './world/clock';

/** A required people bullet and an optional text bullet, as a report type's spec. */
export const BULLETS: readonly BulletSpec[] = [
  { key: 'organisers', label: 'Organizátoři', kind: 'people', required: true, role: 'organisers' },
  { key: 'results', label: 'Výsledky', kind: 'text', required: false },
];

export const person = { salutation: 'pani', givenName: 'Eva', familyName: 'Malá' };
const statement = { speaker: person, speakerGenitive: 'paní Evy Malé', quote: 'Bylo to skvělé.' };
export const paragraph = (text: string, indent = 0) => ({
  type: 'paragraph',
  attrs: { indent },
  content: [{ type: 'text', text }],
});
export const doc = (...paragraphs: readonly ReturnType<typeof paragraph>[]) => ({
  type: 'doc',
  content: paragraphs,
});

/** What the editor sends for an empty point: dates and times as ISO text. */
export const wire = (over: Record<string, unknown> = {}) => ({
  title: '',
  eventDate: null,
  endDate: null,
  timeFrom: null,
  timeTo: null,
  campus: null,
  place: null,
  opening: '',
  openingEdited: false,
  body: doc(),
  bullets: [],
  statements: [],
  ...over,
});

/** A report readiness passes, with the optional bullet left empty. */
export const readyReport = (over: Record<string, unknown> = {}) =>
  wire({
    title: 'Den otevřených dveří',
    eventDate: '2027-01-14',
    opening: 'Ve čtvrtek se konal den otevřených dveří.',
    bullets: [
      {
        key: 'organisers',
        label: 'Organizátoři',
        kind: 'people',
        order: 'input',
        people: [person],
      },
      { key: 'results', label: 'Výsledky', kind: 'text', text: '' },
    ],
    statements: [statement],
    ...over,
  });

/** A finance or pokyn proposal readiness passes. */
export const readyProposal = (over: Record<string, unknown> = {}) =>
  wire({ title: 'Nákup projektoru', body: doc(paragraph('Navrhuji koupit projektor.')), ...over });

/** The world clock's start, Monday 19 October 2026, where every test begins. */
export const START = CLOCK_START;
/** The first Monday whose deadline is ahead at START. */
export const FIRST_MONDAY = calDate(2026, 10, 26);

export function pointFixtures(world: World) {
  /** A new point of the author's, made through the use case. */
  async function start(author: UserRecord, kind: PointKind = 'report'): Promise<string> {
    const typeId =
      kind === 'report'
        ? (await world.seed.pointType({ name: 'Seminář', position: 1, defaultBullets: BULLETS })).id
        : null;
    const result = await world.run(createPoint, world.as(author), {
      clientRef: randomUUID(),
      kind,
      typeId,
    });
    if (!result.ok) throw new Error(`create refused: ${result.error.code}`);
    return result.value.id;
  }

  /**
   * Moves the author's point to `state` past the use cases, as a review would
   * leave it, filling what a handed-in point must hold (`points_submitted_complete`). A point
   * with no first Monday yet gets `earliest`.
   */
  async function moveTo(
    author: UserRecord,
    id: string,
    state: PointState,
    earliest = FIRST_MONDAY,
  ): Promise<void> {
    await world.tx(world.as(author), async (tx) => {
      const point = (await tx.points.loadForWrite(id))!;
      const { content } = point;
      await tx.points.update(id, point.version, {
        content: {
          ...content,
          title: content.title || 'Den',
          eventDate: content.eventDate ?? parseIsoDate('2027-01-14'),
          opening: content.opening || 'Ve čtvrtek…',
        },
        state,
        ...(point.submittedAt === null && { submittedAt: world.clock.now() }),
        ...(point.earliestMonday === null && { earliestMonday: earliest }),
      });
      await tx.audit.record({ action: `point.${state}`, target: { type: 'point', id } });
    });
  }

  const get = (by: UserRecord, id: string) =>
    world.tx(world.as(by), (tx) => tx.points.get(id), 'read');

  /**
   * Everything a use case on the point may write, read as the system so no
   * scope hides a row: the point, its events, every issue row and the audit log.
   */
  const snapshot = (id: string) =>
    world.tx(
      system('test.seed'),
      async (tx) => ({
        point: await tx.points.get(id),
        events: await tx.pointEvents.list(id),
        issues: await tx.issues.between(calDate(2026, 1, 5), calDate(2028, 1, 3)),
        audit: await world.inspect.audit(),
      }),
      'read',
    );

  return { start, moveTo, get, snapshot };
}

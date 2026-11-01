/**
 * Fixtures for the tests of what an issue reads: issues made through the repository, points and
 * akce put into a state past the use cases, with the dates the selection rules look at.
 */
import { randomUUID } from 'node:crypto';

import { system, type FutureContent, type IssueRecord, type UserRecord } from '@/application/ports';
import { deadline, DEFAULT_DEADLINE, type FutureKind } from '@/domain/calendar';
import { schoolYear } from '@/domain/cs';
import type { PointContent, PointKind } from '@/domain/report';
import type { FutureState, IssueStatus, PointState } from '@/domain/review';
import { emptyRichDoc, richDocFromText } from '@/domain/richtext';
import { calDate, wallTime, type CalDate } from '@/domain/time';

import type { World } from './world';

const EMPTY: PointContent = {
  title: '',
  eventDate: null,
  endDate: null,
  timeFrom: null,
  timeTo: null,
  campus: null,
  place: null,
  opening: '',
  openingEdited: false,
  body: emptyRichDoc(),
  bullets: [],
  statements: [],
};

/** A report the assembler takes whole: a people bullet and a statement, every count zero. */
const FULL_REPORT: PointContent = {
  title: 'Seminář o vodě',
  eventDate: calDate(2026, 10, 20),
  endDate: null,
  timeFrom: wallTime(8, 0),
  timeTo: wallTime(14, 30),
  campus: 'radlice',
  place: 'v učebně S206',
  opening: 'Ve čtvrtek proběhl seminář.',
  openingEdited: true,
  body: richDocFromText('Další odstavec.'),
  bullets: [
    {
      key: 'participants',
      label: 'Účastníci',
      kind: 'people',
      order: 'class-surname',
      people: [{ salutation: 'pan', givenName: 'Jan', familyName: 'Novák', affiliation: '3.B' }],
    },
    { key: 'results', label: 'Výsledky', kind: 'text', text: '1. místo' },
  ],
  statements: [
    {
      speaker: { salutation: 'pan', givenName: 'Jan', familyName: 'Novák' },
      speakerGenitive: 'pana Jana Nováka',
      affiliation: '3.B',
      quote: 'Bylo to zajímavé.',
    },
  ],
};

export interface PointSeed {
  readonly author: UserRecord;
  readonly kind?: PointKind;
  readonly state?: PointState;
  readonly earliest?: CalDate;
  readonly handIn?: CalDate;
  readonly submittedAt?: Date;
  readonly title?: string;
  /** Report only: the event's first and last day. */
  readonly eventDate?: CalDate;
  readonly endDate?: CalDate | null;
  readonly content?: Partial<PointContent>;
}

export interface FutureSeed {
  readonly author: UserRecord;
  readonly kind?: FutureKind;
  readonly state?: FutureState;
  readonly title?: string;
  readonly startDate?: CalDate | null;
  readonly endDate?: CalDate | null;
  readonly submittedAt?: Date;
  readonly content?: Partial<FutureContent>;
}

export function issueFixtures(world: World) {
  const seeder = system('test.seed');
  let counter = 0;

  /** A row as the repository makes it, with the default rule's deadline unless given. */
  async function issue(
    monday: CalDate,
    {
      status = 'open',
      meetingDate = monday,
      deadlineAt,
    }: { status?: IssueStatus; meetingDate?: CalDate; deadlineAt?: Date } = {},
  ): Promise<IssueRecord> {
    return world.tx(seeder, async (tx) => {
      const created = await tx.issues.ensure({
        monday,
        meetingDate,
        schoolYear: schoolYear(monday),
        deadlineAt: deadlineAt ?? deadline(meetingDate, DEFAULT_DEADLINE),
      });
      await tx.audit.record({
        action: 'test.seed',
        target: null,
        related: [{ type: 'issue', id: created.issue.id }],
      });
      let row = created.issue;
      if (status !== 'open') {
        row = await tx.issues.setStatus(row.id, row.version, status);
        await tx.audit.record({ action: 'test.seed', target: { type: 'issue', id: row.id } });
      }
      return row;
    });
  }

  /** A point of the author's put into `state` (approved by default) with the given Mondays. */
  async function point(seed: PointSeed): Promise<string> {
    const kind = seed.kind ?? 'pokyn';
    counter += 1;
    const typeId =
      kind === 'report'
        ? (
            await world.seed.pointType({
              name: `Typ ${counter}-${randomUUID()}`,
              position: counter,
            })
          ).id
        : null;
    const earliest = seed.earliest ?? calDate(2026, 10, 26);
    const base = kind === 'report' ? FULL_REPORT : EMPTY;
    const content: PointContent = {
      ...base,
      title: seed.title ?? `Bod ${counter}`,
      ...(kind === 'report' && {
        eventDate: seed.eventDate ?? calDate(2026, 10, 20),
        endDate: seed.endDate === undefined ? null : seed.endDate,
      }),
      ...(kind !== 'report' && { body: richDocFromText(`Text bodu ${counter}.`) }),
      ...seed.content,
    };
    return world.tx(world.as(seed.author), async (tx) => {
      const { point } = await tx.points.create({
        clientRef: randomUUID(),
        kind,
        typeId,
        content,
      });
      await tx.audit.record({ action: 'point.save', target: { type: 'point', id: point.id } });
      const state = seed.state ?? 'approved';
      if (state !== 'draft') {
        await tx.points.update(point.id, point.version, {
          state,
          earliestMonday: earliest,
          handInMonday: seed.handIn ?? earliest,
          submittedAt: seed.submittedAt ?? new Date(world.clock.now().getTime() + counter * 1000),
        });
        await tx.audit.record({
          action: `point.${state}`,
          target: { type: 'point', id: point.id },
        });
      }
      return point.id;
    });
  }

  /** A jednání or akce of the author's put into `state` (approved by default). */
  async function future(seed: FutureSeed): Promise<string> {
    counter += 1;
    const content: FutureContent = {
      title: seed.title ?? `Akce ${counter}`,
      startDate: seed.startDate === undefined ? calDate(2026, 11, 10) : seed.startDate,
      endDate: seed.endDate ?? null,
      timeFrom: null,
      timeTo: null,
      campus: null,
      place: null,
      responsible: null,
      ...seed.content,
    };
    return world.tx(world.as(seed.author), async (tx) => {
      const { item } = await tx.futureItems.create({
        clientRef: randomUUID(),
        kind: seed.kind ?? 'akce',
        content,
      });
      await tx.audit.record({
        action: 'future.save',
        target: { type: 'future_item', id: item.id },
      });
      const state = seed.state ?? 'approved';
      if (state !== 'draft') {
        await tx.futureItems.update(item.id, item.version, {
          state,
          submittedAt: seed.submittedAt ?? new Date(world.clock.now().getTime() + counter * 1000),
        });
        await tx.audit.record({
          action: `future.${state}`,
          target: { type: 'future_item', id: item.id },
        });
      }
      return item.id;
    });
  }

  return { issue, point, future };
}

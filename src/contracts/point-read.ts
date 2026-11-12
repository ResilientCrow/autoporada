import { z } from 'zod';

import { TITLE_GENDERS } from '@/domain/cs';
import { POINT_LIMITS } from '@/domain/report';
import type { PointEvent, PointState } from '@/domain/review';

import { CURSOR_MAX, cursorSchema } from './cursor';
import { pointContentWire, pointFieldsWire, pointKindSchema } from './point';
import { defaultBulletsSchema } from './point-type';

/** Every `PointState` once: the compiler refuses a missing or an unknown one. */
const POINT_STATES: Readonly<Record<PointState, PointState>> = {
  draft: 'draft',
  submitted: 'submitted',
  returned: 'returned',
  approved: 'approved',
  rejected: 'rejected',
  withdrawn: 'withdrawn',
  published: 'published',
};
const pointStateSchema = z.enum(POINT_STATES);

/** Every event of a point's timeline once: a transition, or a reviewer's edit. */
const POINT_EVENTS: Readonly<Record<PointEvent | 'edit', PointEvent | 'edit'>> = {
  submit: 'submit',
  retract: 'retract',
  withdraw: 'withdraw',
  approve: 'approve',
  return: 'return',
  reject: 'reject',
  publish: 'publish',
  unpublish: 'unpublish',
  close: 'close',
  edit: 'edit',
};

const instant = z.iso.datetime();
const day = z.iso.date();
const version = z.number().int().positive();

/** One point, by id: a read sees it only inside the reader's scope. */
const pointRef = z.strictObject({ id: z.uuid() });

/** Where the point stands for the reader: `editable` when the author may change it in the editor. */
const standing = { version, state: pointStateSchema, editable: z.boolean() };

/** „Ponechat moji verzi“ after a conflict (design section 8). */
export const pointStatusInput = pointRef;
export const pointStatusOutput = z.object(standing);

/**
 * What /body/[id] shows, the editor and the read view alike. The timeline is
 * newest first and names no one; a review edit carries the values it replaced
 * (D13), which only those who see the point read.
 */
export const getPointInput = pointRef;
export const getPointOutput = z.object({
  id: z.uuid(),
  kind: pointKindSchema,
  ...standing,
  updatedAt: instant,
  earliestMonday: day.nullable(),
  submittedAt: instant.nullable(),
  isAuthor: z.boolean(),
  content: pointContentWire,
  /** A report's type, retired ones too; null for finance and pokyn. */
  type: z
    .object({
      id: z.uuid(),
      name: z.string(),
      titleGender: z.enum(TITLE_GENDERS).nullable(),
      defaultBullets: defaultBulletsSchema,
    })
    .nullable(),
  timeline: z.array(
    z.object({
      event: z.enum(POINT_EVENTS),
      fromState: pointStateSchema,
      toState: pointStateSchema,
      note: z.string().nullable(),
      /** A return's parts to rework (POINT_RETURN_PARTS); null when it names none. */
      parts: z.array(z.string()).nullable(),
      editedFields: z.array(z.string()).nullable(),
      /** A review edit's „Původní znění“: the values of exactly the fields it changed. */
      before: pointFieldsWire.nullable(),
      createdAt: instant,
    }),
  ),
});

/** The most rows of „Moje body“ on one page; „Starší body“ asks for the next. */
export const MY_POINTS_PAGE = 200;

/** „Moje body“: the author's own points, a page at a time. */
export const listMyPointsInput = z.strictObject({ before: cursorSchema.optional() });
/** `next` is null on the last page: set only when an older point exists. */
export const listMyPointsOutput = z.object({
  points: z
    .array(
      z.object({
        id: z.uuid(),
        kind: pointKindSchema,
        typeId: z.uuid().nullable(),
        state: pointStateSchema,
        title: z.string(),
        eventDate: day.nullable(),
        earliestMonday: day.nullable(),
        handInMonday: day.nullable(),
        /** The first line of the note the reviewer returned the point with; null unless it is `returned`. */
        returnNote: z.string().max(POINT_LIMITS.note).nullable(),
        version,
        updatedAt: instant,
      }),
    )
    .max(MY_POINTS_PAGE),
  next: z.string().max(CURSOR_MAX).nullable(),
});

/** The most handed-in points the review queue lists: the submitted ones first, each the oldest first. */
export const QUEUE_LIMIT = 500;

/** A point of the review queue as `/kontrola` lists it. */
const queueRow = z.object({
  id: z.uuid(),
  kind: pointKindSchema,
  title: z.string(),
  /** A report's type; null for finance and pokyn. */
  typeName: z.string().nullable(),
  /** The last submission. */
  submittedAt: instant,
  /** „Vráceno dříve“: the point was returned at least once. */
  returnedBefore: z.boolean(),
});

/** „Kontrola“ (design section 10): no input; the reviewer's scope decides what is in it. */
export const queuePointsInput = z.strictObject({});
export const queuePointsOutput = z.object({
  /**
   * The submitted points by the Monday they go to, earliest first, and inside a Monday by kind
   * (report, finance, pokyn), the oldest submission first. `monday` is null, and last, for points
   * no Monday of the window takes.
   */
  mondays: z.array(
    z.object({
      monday: day.nullable(),
      /** The day that porada is held (its Monday unless it was moved); the heading prints it. */
      meetingDate: day.nullable(),
      kinds: z.array(
        z.object({ kind: pointKindSchema, points: z.array(queueRow).max(QUEUE_LIMIT) }),
      ),
    }),
  ),
  /** The approved points not yet in an issue, the oldest submission first, each with its Monday. */
  approved: z
    .array(queueRow.extend({ monday: day.nullable(), meetingDate: day.nullable() }))
    .max(QUEUE_LIMIT),
  /** More points wait than the queue lists: past `QUEUE_LIMIT`, the approved, then the newest submitted are left out. */
  more: z.boolean(),
});

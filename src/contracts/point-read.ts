import { z } from 'zod';

import type { TitleGender } from '@/domain/cs';
import type { PointEvent, PointState } from '@/domain/review';

import { pointContentWire, pointKindSchema } from './point';
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
  edit: 'edit',
};

const TITLE_GENDERS: Readonly<Record<TitleGender, TitleGender>> = {
  m: 'm',
  f: 'f',
  n: 'n',
  pl: 'pl',
  npl: 'npl',
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
 * newest first and names no one; a review edit's previous values join it
 * with the review edit (design row 40).
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
      editedFields: z.array(z.string()).nullable(),
      createdAt: instant,
    }),
  ),
});

/** The most rows of „Moje body“ on one page; „Starší body“ asks for the next. */
export const MY_POINTS_PAGE = 200;

/** Where a page ended, as `{ms}.{id}`: text a query parameter carries as it is. */
const CURSOR = /^(\d{1,15})\.([0-9a-f-]{36})$/;
const CURSOR_MAX = 52;

export const pointCursorText = ({
  updatedAt,
  id,
}: {
  readonly updatedAt: Date;
  readonly id: string;
}) => `${updatedAt.getTime()}.${id}`;

const pointCursorSchema = z
  .string()
  .max(CURSOR_MAX)
  .transform((text, ctx) => {
    const [, ms, id] = CURSOR.exec(text) ?? [];
    if (ms === undefined || id === undefined || !z.uuid().safeParse(id).success) {
      ctx.addIssue({ code: 'custom', message: 'invalid' });
      return z.NEVER;
    }
    return { updatedAt: new Date(Number(ms)), id };
  });

/** „Moje body“: the author's own points, a page at a time. */
export const listMyPointsInput = z.strictObject({ before: pointCursorSchema.optional() });
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
        submittedAt: instant.nullable(),
        /** The first line of the note the reviewer returned the point with; null unless it is `returned`. */
        returnNote: z.string().max(2000).nullable(),
        version,
        updatedAt: instant,
      }),
    )
    .max(MY_POINTS_PAGE),
  next: z.string().max(CURSOR_MAX).nullable(),
});

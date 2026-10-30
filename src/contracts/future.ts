import { z } from 'zod';

import type { FutureKind } from '@/domain/calendar';
import type { Campus, ResponsibleVerb } from '@/domain/cs';
import { displayName, POINT_LIMITS, type Responsible } from '@/domain/report';
import type { FutureEvent, FutureState, ReportState } from '@/domain/review';
import { compareDates, toIsoDate, toIsoTime, type CalDate, type WallTime } from '@/domain/time';

import { CURSOR_MAX, cursorSchema } from './cursor';
import { campusSchema, draftPersonSchema, isoDate, wallTime } from './point';

/** Every `FutureKind` once: the compiler refuses a missing or an unknown one. */
const FUTURE_KINDS: Readonly<Record<FutureKind, FutureKind>> = { jednani: 'jednani', akce: 'akce' };
export const futureKindSchema = z.enum(FUTURE_KINDS);

/** Every `FutureState` once. */
const FUTURE_STATES: Readonly<Record<FutureState, FutureState>> = {
  draft: 'draft',
  submitted: 'submitted',
  returned: 'returned',
  approved: 'approved',
  rejected: 'rejected',
  withdrawn: 'withdrawn',
  cancelled: 'cancelled',
};
const futureStateSchema = z.enum(FUTURE_STATES);

/** Every `ReportState` once. */
const REPORT_STATES: Readonly<Record<ReportState, ReportState>> = {
  none: 'none',
  prompted: 'prompted',
  written: 'written',
  declined: 'declined',
};
const reportStateSchema = z.enum(REPORT_STATES);

/** Every event of an item's history once: a transition, or a reviewer's edit. */
const FUTURE_EVENTS: Readonly<Record<FutureEvent | 'edit', FutureEvent | 'edit'>> = {
  submit: 'submit',
  retract: 'retract',
  withdraw: 'withdraw',
  approve: 'approve',
  return: 'return',
  reject: 'reject',
  revise: 'revise',
  cancel: 'cancel',
  edit: 'edit',
};
const futureEventSchema = z.enum(FUTURE_EVENTS);

/** Every `ResponsibleVerb` once. */
const VERBS: Readonly<Record<ResponsibleVerb, ResponsibleVerb>> = {
  organizuje: 'organizuje',
  koordinuje: 'koordinuje',
  zajišťuje: 'zajišťuje',
  vede: 'vede',
};

/** Who is behind an akce and in which words: „za … koordinuje …“. */
const responsibleSchema = z.strictObject({
  verb: z.enum(VERBS),
  behalfOf: z.string().max(POINT_LIMITS.person.affiliation).optional(),
  people: z.array(draftPersonSchema).max(POINT_LIMITS.responsiblePeople),
}) satisfies z.ZodType<Responsible>;

/**
 * The one parse of an item's `responsible` jsonb, on read and before write: the value
 * wrapped, because null is a valid one; undefined when the contract refuses it.
 */
export function parseResponsible(
  value: unknown,
): { readonly value: Responsible | null } | undefined {
  const parsed = responsibleSchema.nullable().safeParse(value);
  return parsed.success ? { value: parsed.data } : undefined;
}

const capped = (max: number) => z.string().max(max);

/**
 * A jednání or an akce as its author writes it: every field bounded, an end
 * date never before the start (`future_items_dates`). A draft may be
 * unfinished; the title, the start date and the rest are asked for at submit.
 */
const futureContentSchema = z
  .strictObject({
    title: capped(POINT_LIMITS.title),
    startDate: isoDate,
    endDate: isoDate,
    timeFrom: wallTime,
    timeTo: wallTime,
    campus: campusSchema.nullable(),
    place: capped(POINT_LIMITS.place).nullable(),
    responsible: responsibleSchema.nullable(),
    expectsReport: z.boolean(),
  })
  .superRefine(({ startDate, endDate }, ctx) => {
    if (endDate && (!startDate || compareDates(endDate, startDate) < 0)) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'invalid' });
    }
  });

/** The content as a read gives it to the editor: dates and times as the ISO text the save takes. */
const futureContentWire = z.strictObject({
  title: z.string(),
  startDate: z.iso.date().nullable(),
  endDate: z.iso.date().nullable(),
  timeFrom: z.iso.time({ precision: -1 }).nullable(),
  timeTo: z.iso.time({ precision: -1 }).nullable(),
  campus: campusSchema.nullable(),
  place: z.string().nullable(),
  responsible: responsibleSchema.nullable(),
  expectsReport: z.boolean(),
});

/** What the stored content is made of, as the domain has it. */
export interface FutureContentValue {
  readonly title: string;
  readonly startDate: CalDate | null;
  readonly endDate: CalDate | null;
  readonly timeFrom: WallTime | null;
  readonly timeTo: WallTime | null;
  readonly campus: Campus | null;
  readonly place: string | null;
  readonly responsible: Responsible | null;
  readonly expectsReport: boolean;
}

const dateText = (date: CalDate | null) => date && toIsoDate(date);
const timeText = (time: WallTime | null) => time && toIsoTime(time);

/** The stored content in the wire shape of `futureContentWire`. */
export const futureContentToWire = (
  content: FutureContentValue,
): z.input<typeof futureContentWire> => ({
  ...content,
  startDate: dateText(content.startDate),
  endDate: dateText(content.endDate),
  timeFrom: timeText(content.timeFrom),
  timeTo: timeText(content.timeTo),
  responsible: content.responsible && {
    ...content.responsible,
    people: [...content.responsible.people],
  },
});

/**
 * What a reader who is not the author sees of an item: the list row's content. Who is responsible
 * is a name each; no salutation, affiliation or directory id (design section 12, privacy review).
 */
export const futureView = z.strictObject({
  title: z.string(),
  startDate: z.iso.date().nullable(),
  endDate: z.iso.date().nullable(),
  timeFrom: z.iso.time({ precision: -1 }).nullable(),
  timeTo: z.iso.time({ precision: -1 }).nullable(),
  campus: campusSchema.nullable(),
  place: z.string().nullable(),
  expectsReport: z.boolean(),
  responsible: z
    .strictObject({
      verb: z.enum(VERBS),
      behalfOf: z.string().nullable(),
      names: z.array(z.string()),
    })
    .nullable(),
});

/** The stored content as `futureView`: the wire conversion, with the people reduced to names. */
export function futureContentToView(content: FutureContentValue): z.input<typeof futureView> {
  const { responsible, ...rest } = futureContentToWire(content);
  return {
    ...rest,
    responsible: responsible && {
      verb: responsible.verb,
      behalfOf: responsible.behalfOf ?? null,
      names: responsible.people.map(displayName),
    },
  };
}

/** „Nový bod do přehledu“: `clientRef` is the draft's id in the browser, so a retry returns the same one. */
export const createFutureInput = z.strictObject({ clientRef: z.uuid(), kind: futureKindSchema });
export const createFutureOutput = z.object({ id: z.uuid() });

/** A write to an item names the item and the version the page showed. */
export const futureWrite = { id: z.uuid(), expectedVersion: z.number().int().positive() };
export const version = z.number().int().positive();

/**
 * The author's autosave: the whole content against the version the editor holds. An approved akce
 * is never autosaved: its „Uložit změny“ sends `intent: 'revise'`, and that one save hands the
 * change in for review. The state comes back too, because the revise moves it.
 */
export const saveFutureInput = z.strictObject({
  ...futureWrite,
  content: futureContentSchema,
  intent: z.literal('revise').optional(),
});
export const saveFutureOutput = z.object({ version, state: futureStateSchema });

/** „Odeslat ke kontrole“: the content the editor holds, saved and handed in at once. */
export const submitFutureInput = z.strictObject({ ...futureWrite, content: futureContentSchema });
export const submitFutureOutput = z.object({ version });

/** „Stáhnout“: a submitted item back to the drafts. */
export const retractFutureInput = z.strictObject(futureWrite);
export const retractFutureOutput = z.object({ version });

const instant = z.iso.datetime();

/** One item, by id: a read sees it only inside the reader's scope. */
export const getFutureInput = z.strictObject({ id: z.uuid() });
export const getFutureOutput = z.object({
  id: z.uuid(),
  kind: futureKindSchema,
  state: futureStateSchema,
  version,
  /** The reader wrote it. */
  isAuthor: z.boolean(),
  /** The reader may change it in the editor: its author, while it is theirs to change. */
  editable: z.boolean(),
  updatedAt: instant,
  submittedAt: instant.nullable(),
  reportState: reportStateSchema,
  reportPointId: z.uuid().nullable(),
  /** For the author only, who edits it; everyone else gets `view`. */
  content: futureContentWire.nullable(),
  view: futureView,
  /** For the author and reviewers only; naming no one. */
  timeline: z.array(
    z.object({
      event: futureEventSchema,
      fromState: futureStateSchema,
      toState: futureStateSchema,
      note: z.string().nullable(),
      editedFields: z.array(z.string()).nullable(),
      createdAt: instant,
    }),
  ),
});

/** The items a page lists: one page, the newest changes first. */
export const FUTURE_LIST_PAGE = 200;

/** „Akce“: what the reader may see, a page at a time. */
export const listFutureInput = z.strictObject({ before: cursorSchema.optional() });
export const listFutureOutput = z.object({
  items: z
    .array(
      futureView.extend({
        id: z.uuid(),
        kind: futureKindSchema,
        state: futureStateSchema,
        isAuthor: z.boolean(),
        updatedAt: instant,
      }),
    )
    .max(FUTURE_LIST_PAGE),
  /** Where the older items start: set only when there are older items than this page holds. */
  next: z.string().max(CURSOR_MAX).nullable(),
});

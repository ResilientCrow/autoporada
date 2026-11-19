import { z } from 'zod';

import type { FutureKind } from '@/domain/calendar';
import { ORGANIZER_ROLES, PARTICIPANTS_ADDRESSES } from '@/domain/cs';
import { POINT_LIMITS } from '@/domain/report';
import type { FutureState } from '@/domain/review';
import { compareDates } from '@/domain/time';

import { campusSchema, isoDate, wallTime } from './point';

/** Every `FutureKind` once: the compiler refuses a missing or an unknown one. */
const FUTURE_KINDS: Readonly<Record<FutureKind, FutureKind>> = { jednani: 'jednani', akce: 'akce' };
const futureKindSchema = z.enum(FUTURE_KINDS);

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

/** What the organizer does (ADR 0063). */
const organizerRoleSchema = z.enum(ORGANIZER_ROLES);

/** How the participants of an akce are addressed as one group (ADR 0071). */
const participantsAddressSchema = z.enum(PARTICIPANTS_ADDRESSES);

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
    organizer: capped(POINT_LIMITS.organizer).nullable(),
    organizerRole: organizerRoleSchema.nullable(),
    participants: capped(POINT_LIMITS.participants).nullable(),
    participantsAddress: participantsAddressSchema.nullable(),
    note: capped(POINT_LIMITS.futureNote).nullable(),
  })
  .superRefine(({ startDate, endDate }, ctx) => {
    if (endDate && (!startDate || compareDates(endDate, startDate) < 0)) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'invalid' });
    }
  });

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

/** „Smazat akci / schůzku“: a draft, returned or submitted item gone; `confirmed` is the dialog's yes. */
export const withdrawFutureInput = z.strictObject({ ...futureWrite, confirmed: z.boolean() });
export const withdrawFutureOutput = z.object({ version });

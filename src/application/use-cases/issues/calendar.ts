import { readSlots } from '@/application/core';
import type { Tx } from '@/application/ports';
import { submitMonday, type DeadlineRule, type IssueSlot } from '@/domain/calendar';
import { isoWeekday, parseIsoDate, type CalDate } from '@/domain/time';

/** What the meeting calendar shows at `now`, read once for every use case that needs it. */
export interface IssueWindow {
  /** The stored rows from this week on plus the untouched Mondays, in Monday order. */
  readonly slots: readonly IssueSlot[];
  /** The Monday of the first open slot whose deadline is still ahead, frozen deadlines counted. */
  readonly first: CalDate;
  /** The deadline rule the slots were made with: what the caller counts and freezes by, and no other. */
  readonly rule: DeadlineRule;
  /** The effective boundary (ADR 0054): up to it a Monday with no row is no porada. */
  readonly plannedThrough: CalDate;
}

/** The slots around `now`, the rule they were made with and the Monday a submission is for. */
export async function readWindow(tx: Tx, now: Date): Promise<IssueWindow> {
  const { slots, rule, plannedThrough } = await readSlots(tx, now);
  return { slots, first: submitMonday(now, slots, rule, plannedThrough), rule, plannedThrough };
}

/** The calendar day the text names, or null when it is out of range. */
export function dayOfText(text: string): CalDate | null {
  try {
    return parseIsoDate(text);
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

/** The Monday the text names, or null when it is no Monday or is out of the calendar's range. */
export function mondayOfText(text: string): CalDate | null {
  const date = dayOfText(text);
  return date && isoWeekday(date) === 1 ? date : null;
}

/** A day the calendar acts refuse as a field error: before today or past the horizon, or not a change at all. */
export const INVALID_DATE = {
  code: 'invalid-input',
  fields: { meetingDate: 'invalid' },
} as const;

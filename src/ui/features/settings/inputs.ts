import type { z } from 'zod';

import type { settingsSaveInput } from '@/contracts';
import { formatTime, weekdayName } from '@/domain/cs';
import { addDays, parseIsoDate, parseWallTime } from '@/domain/time';
import { choiceOf, flagOf, richDocOf, textOf } from '@/ui/form';

export type SaveInput = z.input<typeof settingsSaveInput>;

/** A Monday, for the example line: the rule counts back from it. */
const EXAMPLE_MONDAY = parseIsoDate('2026-11-02');

/** The quarter hours from 08.00 to 22.00 a deadline may be set to, as „HH:MM“. */
export const QUARTER_HOURS: readonly string[] = Array.from({ length: 57 }, (_, i) => {
  const minutes = 8 * 60 + i * 15;
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(Math.floor(minutes / 60))}:${two(minutes % 60)}`;
});

/** The weekday and time of the deadline of a Monday porada under the rule, „sobota“ and „20.00“. */
export function exampleOf(days: number, time: string): { day: string; time: string } {
  return {
    day: weekdayName(addDays(EXAMPLE_MONDAY, -days)),
    time: formatTime(parseWallTime(time)),
  };
}

/** Whether the selects hold another rule than the saved one; only then is there an effect to tell. */
export function differsFromSaved(
  saved: { readonly dayOffset: number; readonly time: string },
  days: string,
  time: string,
): boolean {
  return -saved.dayOffset !== Number(days) || saved.time !== time;
}

/** What the deadline form sends: the days before the meeting as a negative offset, and the time. */
export function deadlineInput(version: number, data: FormData): SaveInput {
  return {
    key: 'deadline',
    value: {
      dayOffset: -Number(choiceOf(data, 'value.dayOffset', ['1', '2', '3', '4'])),
      time: choiceOf(data, 'value.time', QUARTER_HOURS),
    },
    version,
  };
}

/** What the reminders form sends: both switches. */
export function remindersInput(version: number, data: FormData): SaveInput {
  return {
    key: 'reminders',
    value: { soft: flagOf(data, 'value.soft'), hard: flagOf(data, 'value.hard') },
    version,
  };
}

/** What the annex texts form sends: the heading and the intro as the rich field's paragraphs. */
export function annexInput(version: number, data: FormData): SaveInput {
  return {
    key: 'texts.annex1',
    value: { heading: textOf(data, 'value.heading'), intro: richDocOf(data, 'value.intro') },
    version,
  };
}

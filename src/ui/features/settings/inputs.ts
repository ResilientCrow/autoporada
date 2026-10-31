import type { z } from 'zod';

import { bodyWire, type settingsSaveInput } from '@/contracts';
import { formatTime, weekdayName } from '@/domain/cs';
import { richDocFromText } from '@/domain/richtext';
import { addDays, parseIsoDate, parseWallTime } from '@/domain/time';
import { choiceOf, flagOf, textOf } from '@/ui/form';

/** The intro as the wire carries it; only the paragraphs' text matters to the plain-text field. */
export interface IntroDoc {
  readonly content: readonly { readonly content?: readonly { readonly text: string }[] }[];
}

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

/** The intro as the text area starts from it: one paragraph per block, a blank line between. */
export function introText(doc: IntroDoc): string {
  return doc.content.map((p) => (p.content ?? []).map((t) => t.text).join('')).join('\n\n');
}

/** The text area's text as paragraphs: blocks split by blank lines, a block's lines joined by spaces. */
function introDoc(text: string) {
  const blocks = text
    .split(/(?:\r\n|[\r\n])[ \t]*(?:\r\n|[\r\n])(?:[ \t]*(?:\r\n|[\r\n]))*/)
    .map((block) =>
      block
        .split(/\r\n|[\r\n]/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join(' '),
    )
    .filter((block) => block !== '');
  return bodyWire({ type: 'doc', content: blocks.flatMap((b) => richDocFromText(b).content) });
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

/** What the annex texts form sends: the heading and the intro as paragraphs. */
export function annexInput(version: number, data: FormData): SaveInput {
  return {
    key: 'texts.annex1',
    value: { heading: textOf(data, 'value.heading'), intro: introDoc(textOf(data, 'value.intro')) },
    version,
  };
}

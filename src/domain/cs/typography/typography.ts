/**
 * Czech typography for generated output (DOCX, PDF, previews). Stored text
 * stays as typed. Every rule except the ellipsis keeps the text length, so a
 * paragraph can be processed as one string and mapped back onto its runs —
 * „v “ + bold „Příloze“ still gets its non-breaking space.
 */

import { MONTH_GENITIVE } from '../dates/tables';
import { TITLES_BEFORE } from '../names/titles';

const NBSP = '\u00A0';

/** After these a quote opens. An opening quote of the same kind closes an empty pair. */
const OPENS_DOUBLE = /[\s([{/–—‚]/;
const OPENS_SINGLE = /[\s([{/–—„]/;
const LETTER = /\p{L}/u;

const MONTHS = MONTH_GENITIVE.join('|');
/** Titles plus „č.“ (číslo): „Mgr. Jana“, „č. 12“. */
const TITLES = [...TITLES_BEFORE, 'č'].join('|');

const LENGTH_PRESERVING: readonly [RegExp, string][] = [
  // „a v Praze“ → a v Praze: one-letter words never end a line (chains too).
  [/(?<=(?:^|[\s(„‚[])[vkszouaiVKSZOUAI]) (?=\S)/g, NBSP],
  // „12. října“, „19. 10. 2026“
  [
    new RegExp(
      `(?<=(?:^|[^\\d])\\d{1,2}\\.) (?=\\d{1,2}\\.|\\d{4}(?!\\d)|(?:${MONTHS})(?!\\p{L}))`,
      'gu',
    ),
    NBSP,
  ],
  // „Mgr. Jana“, „Ing. arch. Klára“, „č. 12“
  [new RegExp(`(?<=(?:^|[\\s(])(?:${TITLES})\\.) (?=\\S)`, 'g'), NBSP],
  // Initials stay with the surname: „O. Novák“ (ČSN 01 6910).
  [/(?<=(?:^|[\s(„])\p{Lu}\.) (?=\p{Lu})/gu, NBSP],
  // A spaced hyphen in prose is a dash. A line-initial „- “ marker is kept.
  [/(?<=\s)-(?=\s)/g, '–'],
  // Time and day ranges: 10:00-12:00, 27.-29.
  [/(?<=\d:\d\d)-(?=\d{1,2}:\d\d)/g, '–'],
  [/(?<=\d\.)-(?=\d)/g, '–'],
];

/**
 * Straight and English quotes → Czech „…“ and ‚…‘; apostrophes → ’. Context
 * is read from the converted output, which makes the pass idempotent.
 */
function czechQuotes(text: string): string {
  // An array and a remembered last character keep this linear: reading the
  // end of a growing string would flatten it on every character.
  const out: string[] = [];
  let before: string | undefined;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? '';
    let next = ch;
    if (ch === '"' || ch === '“' || ch === '”') {
      next = before === undefined || OPENS_DOUBLE.test(before) ? '„' : '“';
    } else if (ch === "'" || ch === '‘' || ch === '’') {
      const between = LETTER.test(text[i - 1] ?? '') && LETTER.test(text[i + 1] ?? '');
      next = between ? '’' : before === undefined || OPENS_SINGLE.test(before) ? '‚' : '‘';
    }
    out.push(next);
    before = next;
  }
  return out.join('');
}

function typographizeJoined(text: string): string {
  let out = czechQuotes(text);
  for (const [pattern, replacement] of LENGTH_PRESERVING) out = out.replace(pattern, replacement);
  return out;
}

/** Applies Czech typography across a paragraph's runs, keeping each run's other fields. */
export function typographize<R extends { readonly text: string }>(runs: readonly R[]): R[] {
  const joined = typographizeJoined(runs.map((run) => run.text).join(''));
  let offset = 0;
  return runs.map((run) => {
    const text = joined.slice(offset, offset + run.text.length).replace(/\.\.\./g, '…');
    offset += run.text.length;
    return { ...run, text };
  });
}

export function typographizeText(text: string): string {
  return typographize([{ text }])[0]?.text ?? '';
}

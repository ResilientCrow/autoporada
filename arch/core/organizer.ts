import { foldForSearch, formatName, headedName } from '@/domain/cs';
import { personFromCard } from './select';
import type { Card } from './types';

const PICKS_MAX = 4;

/** The names before the last comma, kept as typed up to the comma (with no trailing space), and the name being typed after it. */
function splitLast(text: string): { before: string; typing: string } {
  const at = text.lastIndexOf(',');
  return at < 0 ? { before: '', typing: text.trim() } : { before: text.slice(0, at).trim(), typing: text.slice(at + 1).trim() };
}

/** What a card writes into the organizer field (ADR 0072 item 7): the headed name, or only the name when the card has no salutation (the author adds theirs). Free text from then on (ADR 0060). */
function phraseOf(card: Card): string {
  const { salutation, head, complement } = personFromCard(card);
  const name = formatName({ salutation: salutation ?? 'pan', givenName: card.givenName, familyName: card.familyName, ...(card.titlesBefore && { titlesBefore: card.titlesBefore }), ...(card.titlesAfter && { titlesAfter: card.titlesAfter }) });
  return salutation ? headedName({ salutation, ...(head && { head }), ...(complement && { complement }) }, name) : name;
}

/** The field's text with the name being typed (after the last comma) replaced by the card's phrase; the earlier names stay as typed. */
export function organizerWith(text: string, card: Card): string {
  const { before } = splitLast(text);
  return before ? `${before}, ${phraseOf(card)}` : phraseOf(card);
}

/**
 * The cards that match the name being typed, as PeoplePick matches (case and diacritics folded, anywhere in „given family“), with the text the field holds after each pick.
 * A pick that would not fit `max` is left out: a cut name would be worse than none.
 */
export function organizerPicks(cards: readonly Card[], text: string, max: number): { card: Card; text: string }[] {
  const wanted = foldForSearch(splitLast(text).typing);
  if (!wanted) return [];
  return cards
    .filter((c) => foldForSearch(`${c.givenName} ${c.familyName}`).includes(wanted))
    .map((card) => ({ card, text: organizerWith(text, card) }))
    .filter((p) => p.text.length <= max)
    .slice(0, PICKS_MAX);
}

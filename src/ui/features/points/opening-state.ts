import { openingSentence, type TitleGender } from '@/domain/cs';
import { openingInput, type BulletSpec, type PointContent } from '@/domain/report';
import { parseIsoDate, parseWallTime } from '@/domain/time';
import { readText } from '@/ui/form';

import type { PointContentWire } from './fields';
import type { Edit } from './report-patch';

/** What the sentence needs besides the content: the type's name, its title gender and its bullets (which name the organisers). */
export interface OpeningContext {
  readonly titleGender: TitleGender | null;
  readonly typeName: string | null;
  readonly spec: readonly BulletSpec[];
}

/** The fields the sentence reads, in the domain's shape. */
function domainContent(content: PointContentWire): PointContent {
  return {
    ...content,
    eventDate: readText(content.eventDate, parseIsoDate),
    endDate: readText(content.endDate, parseIsoDate),
    timeFrom: readText(content.timeFrom, parseWallTime),
    timeTo: readText(content.timeTo, parseWallTime),
    body: { type: 'doc', content: [] },
    statements: [],
  };
}

/** The sentence the fields make, or '' while the title or the start date is missing. */
export function generated(
  content: PointContentWire,
  titleGender: TitleGender | null,
  spec: readonly BulletSpec[],
  typeName: string | null,
): string {
  const input = openingInput(domainContent(content), titleGender, spec, typeName);
  return input === null ? '' : openingSentence(input);
}

/**
 * The content after a change to its fields: while the author has not edited the sentence it
 * is the generated one; once they have, it is never touched.
 */
export function withOpening(content: PointContentWire, ctx: OpeningContext): PointContentWire {
  if (content.openingEdited) return content;
  return { ...content, opening: generated(content, ctx.titleGender, ctx.spec, ctx.typeName) };
}

/** `withOpening` for what the editor holds, whether the fields or the bullets changed. */
export function withOpeningEdit(edit: Edit, ctx: OpeningContext): Edit {
  return { ...edit, content: withOpening(edit.content, ctx) };
}

/** The author typed in the box: from the first keystroke the text is theirs. */
export function typed(content: PointContentWire, text: string): PointContentWire {
  return { ...content, opening: text, openingEdited: true };
}

/**
 * „Ano, nahradit“: the sentence is the fields' again. It only clears the flag; the one
 * recompute (`withOpeningEdit`) that every change goes through writes the text.
 */
export function replaced(content: PointContentWire): PointContentWire {
  return { ...content, openingEdited: false };
}

/**
 * Whether to tell the author their sentence is out of step: it is theirs, the fields make a
 * sentence, and it is not the one `basis` holds (what they made when the text became the
 * author's or when they chose to keep it).
 */
export function noticeShown(
  content: PointContentWire,
  ctx: OpeningContext,
  basis: string,
): boolean {
  if (!content.openingEdited) return false;
  const sentence = generated(content, ctx.titleGender, ctx.spec, ctx.typeName);
  return sentence !== '' && sentence !== basis;
}

/**
 * The basis after a keystroke in the box, given the content before it. It moves only on the
 * keystroke that makes the text the author's (then it is the sentence of the fields as they
 * stand, which that keystroke does not change); typing in text that is already theirs never
 * moves it, so a change of the fields stays noticed until it is answered.
 */
export function basisAfterTyping(
  before: PointContentWire,
  basis: string,
  ctx: OpeningContext,
): string {
  return before.openingEdited ? basis : generated(before, ctx.titleGender, ctx.spec, ctx.typeName);
}

/** The basis after „Ponechat“: the sentence the fields make now. */
export function keptBasis(content: PointContentWire, ctx: OpeningContext): string {
  return generated(content, ctx.titleGender, ctx.spec, ctx.typeName);
}

/** What the area under the box shows: nothing, the notice, or (once asked, until answered) the question. */
export type NoticeMode = 'none' | 'notice' | 'question';

export function noticeMode(stale: boolean, asking: boolean): NoticeMode {
  if (asking) return 'question';
  return stale ? 'notice' : 'none';
}

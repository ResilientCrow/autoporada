import { formatLongDate, formatTitleDate } from '@/domain/cs';
import type { IssueSnapshot } from '@/snapshot';

import type { Block, DocumentModel } from '../model';
import { annex1Intro, annex1Table, annex2 } from './annexes';
import { composeContext } from './context';
import { assertModelInvariants } from './invariants';
import { composeHospodareni, composePokyny } from './pokyny';
import { composeProvoz } from './provoz';
import { finalText, spacer } from './text';

/**
 * A big section heading with the template's spacing, or nothing when it has
 * no points. The heading and its spacers keep with the first point, so a
 * heading never ends a page on its own.
 */
function bigSection(text: string, points: readonly Block[]): Block[] {
  if (points.length === 0) return [];
  const held: Block = { kind: 'spacer', keepNext: true };
  return [...spacer(), { kind: 'section', text: finalText(text) }, held, held, ...points];
}

/** Points are numbered 1, 2, 3 … straight through all three big sections. */
function numberPoints(blocks: readonly Block[]): Block[] {
  let n = 0;
  return blocks.map((b) => (b.kind === 'point' ? { ...b, number: ++n } : b));
}

/**
 * The whole document for one issue: title, attendees, POKYNY, HOSPODAŘENÍ,
 * PROVOZ, closing, Příloha 1 and the optional Příloha 2. Pure: the same
 * snapshot always gives the same model.
 */
export function composeDocument(snapshot: IssueSnapshot): DocumentModel {
  const ctx = composeContext(snapshot);
  const main: Block[] = [
    { kind: 'title', text: finalText(`PORADA VEDENÍ ŠKOLY – ${formatTitleDate(ctx.meeting)}`) },
    ...spacer(2),
    { kind: 'label', label: 'Přítomni:', text: finalText(snapshot.presentText) },
    { kind: 'label', label: 'Hosté:', text: finalText(snapshot.guestsText) },
    ...bigSection('POKYNY PRO ZAMĚSTNANCE, ORGANIZAČNÍ ZÁLEŽITOSTI', composePokyny(ctx)),
    ...bigSection('INFORMACE Z HOSPODAŘENÍ', composeHospodareni(ctx)),
    ...bigSection('INFORMACE Z PROVOZU ŠKOLY', composeProvoz(ctx)),
    ...spacer(),
    {
      kind: 'closing',
      place: finalText(`V Praze dne ${formatLongDate(ctx.meeting)}`),
      signature: 'Zpracoval Autonomní systém Autoporada',
    },
    ...spacer(),
    ...annex1Intro(ctx),
  ];
  const model: DocumentModel = {
    meta: {
      title: `Porada vedení školy ${formatLongDate(ctx.meeting)}`,
      author: 'Autonomní systém Autoporada',
    },
    sections: [{ layout: 'single', blocks: numberPoints(main) }, annex1Table(ctx), ...annex2(ctx)],
  };
  assertModelInvariants(model);
  return model;
}

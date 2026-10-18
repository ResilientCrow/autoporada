import { formatWindow } from '@/domain/cs';
import { isRichDocEmpty } from '@/domain/richtext';
import type { SnapshotItem } from '@/snapshot';

import type { Block } from '../model';
import type { ComposeContext } from './context';
import { futureBullet } from './future';
import { inlineStudents } from './students';
import { finalRuns, finalText, point, quoted, richBlocks, spacer } from './text';

function futurePoint(
  heading: string,
  items: ComposeContext['future']['meetings'],
  none: string,
): Block[] {
  const bullets =
    items.length > 0
      ? items.map(futureBullet)
      : [{ kind: 'bullet' as const, runs: [{ text: none }] }];
  return point(heading, [...spacer(), ...bullets]);
}

function slotBlocks(item: SnapshotItem, ctx: ComposeContext): Block[] {
  const body = () => richBlocks(item.body, ctx.tokens);
  switch (item.slot) {
    case 'meetings':
      return futurePoint(
        `Zatím známá jednání v týdnu ${formatWindow(ctx.monday, ctx.meetingsTo)}`,
        ctx.future.meetings,
        'zatím žádná',
      );
    case 'events':
      return futurePoint(
        `Zatím známé akce v týdnech ${formatWindow(ctx.monday, ctx.eventsTo)}`,
        ctx.future.events,
        'zatím žádné',
      );
    case 'talent':
      return point(item.title, [
        ...body(),
        {
          kind: 'dash',
          label: 'seznam studentů:',
          runs: finalRuns([
            { text: ' je uveden v ' },
            { text: 'Příloze 1', bold: true },
            { text: ' této porady vedení' },
          ]),
        },
      ]);
    case 'exemptions': {
      const lists = ctx.snapshot.registry.filter(
        (l) => l.purpose === 'point4' && l.entries.length > 0,
      );
      const lines: Block[] = lists.map((l) => ({
        kind: 'dash',
        label: finalText(`${l.docLabel}:`),
        runs: finalRuns([{ text: ' ' }, ...inlineStudents(l)]),
      }));
      return point(item.title, [...body(), ...lines]);
    }
    case 'media':
      return isRichDocEmpty(item.body) ? [] : point(item.title, body());
    case 'partners':
      return item.quotes.length === 0
        ? []
        : point(
            item.title,
            item.quotes.map((q) => ({
              kind: 'partner',
              label: finalText(
                `vyjádření ${q.speakerGenitive}${q.affiliation ? ` (${q.affiliation})` : ''}:`,
              ),
              quote: finalText(quoted(q.quote)),
            })),
          );
    case null:
      return point(item.title, body());
  }
}

/** POKYNY in their stored order; empty ohlasy disappear. */
export function composePokyny(ctx: ComposeContext): Block[] {
  return ctx.snapshot.pokyny.flatMap((item) => slotBlocks(item, ctx));
}

/** HOSPODAŘENÍ items are plain standing-content points. */
export function composeHospodareni(ctx: ComposeContext): Block[] {
  return ctx.snapshot.hospodareni.flatMap((item) =>
    point(item.title, richBlocks(item.body, ctx.tokens)),
  );
}

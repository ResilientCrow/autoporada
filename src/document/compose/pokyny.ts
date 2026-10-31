import { formatWindow } from '@/domain/cs';
import { isRichDocEmpty } from '@/domain/richtext';
import type { SnapshotItem } from '@/snapshot';

import type { Block } from '../model';
import type { ComposeContext } from './context';
import { futureBullet } from './future';
import { inlineStudents } from './students';
import { finalRuns, finalText, partnerBlocks, point, richBlocks, spacer } from './text';

function futurePoint(
  heading: string,
  items: ComposeContext['future']['meetings'],
  none: string,
  ctx: ComposeContext,
): Block[] {
  const bullets =
    items.length > 0
      ? items.map((item) => futureBullet(item, ctx.snapshot.options.groupOrder))
      : [{ kind: 'bullet' as const, runs: [{ text: none }] }];
  return point(heading, [...spacer(), ...bullets]);
}

function slotBlocks(item: SnapshotItem, ctx: ComposeContext): Block[] {
  const body = () => richBlocks(item.body, ctx.tokens);
  switch (item.slot) {
    case 'meetings':
      return futurePoint(
        `Zatím známá jednání v týdnu ${formatWindow(ctx.meetings.from, ctx.meetings.to)}`,
        ctx.future.meetings,
        'zatím žádná',
        ctx,
      );
    case 'events':
      return futurePoint(
        `Zatím známé akce v týdnech ${formatWindow(ctx.events.from, ctx.events.to)}`,
        ctx.future.events,
        'zatím žádné',
        ctx,
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
      return item.quotes.length === 0 ? [] : point(item.title, partnerBlocks(item.quotes));
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

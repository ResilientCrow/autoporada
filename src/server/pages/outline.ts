import { readOutline, readOutlineItem } from '@/application/use-cases';
import { formatNumericDate, formatTitleDate, schoolYear } from '@/domain/cs';
import { can } from '@/domain/policy';
import { emptyRichDoc, parseRichDoc, type RichDoc } from '@/domain/richtext';
import { parseIsoDate } from '@/domain/time';
import type { z } from 'zod';

import type { outlineItemOutput, outlineReadOutput } from '@/contracts';

import { getContainer } from '../container';
import { runRegistered } from '../pipeline';

import { orNotFound } from './not-found';
import { getViewer, requestId } from './viewer';

/** /porada/[datum]/pokyny: the lists of the porada and where they come from. */
type Read = z.output<typeof outlineReadOutput>;

export interface OutlinePageModel {
  /** „pondělí 9. listopadu 2026“. */
  readonly meeting: string;
  readonly origin:
    { readonly kind: 'stored' | 'seed' } | { readonly kind: 'derived'; readonly from: string };
  readonly view: Pick<Read, 'monday' | 'version' | 'pokyny' | 'hospodareni'>;
}

/** The outline page of one slot, or null (404) for anyone but the headmaster and for a Monday outside the calendar. */
export async function outlinePage(datum: string): Promise<OutlinePageModel | null> {
  const viewer = await getViewer();
  if (!viewer || !can(viewer.actor, { action: 'issue.edit' })) return null;
  const read = orNotFound(
    'outline.read',
    await runRegistered(getContainer(), readOutline, {
      principal: viewer,
      requestId: await requestId(),
      input: { monday: datum },
    }),
  );
  if (read === null) return null;
  const { origin } = read;
  return {
    meeting: formatTitleDate(parseIsoDate(read.meetingDate)),
    origin:
      origin.kind === 'derived' && origin.from !== null
        ? { kind: 'derived', from: formatNumericDate(parseIsoDate(origin.from)) }
        : { kind: origin.kind === 'seed' ? 'seed' : 'stored' },
    view: {
      monday: read.monday,
      version: read.version,
      pokyny: read.pokyny,
      hospodareni: read.hospodareni,
    },
  };
}

type Item = z.output<typeof outlineItemOutput>;

/** What the item editor is given: the porada it belongs to and the school year its tokens read. */
interface EditorContext {
  /** „pondělí 9. listopadu 2026“. */
  readonly meeting: string;
  readonly monday: string;
  readonly version: number | null;
  /** „2026/2027“, for `{skolniRok}` in the preview. */
  readonly schoolYear: string;
}

export type OutlineItemPageModel =
  | { readonly kind: 'proposal'; readonly pointId: string }
  | {
      readonly kind: 'item';
      readonly context: EditorContext;
      readonly item: Pick<
        Item,
        'lineageId' | 'section' | 'slot' | 'persistence' | 'title' | 'quotes'
      > & { readonly body: RichDoc };
    };

export interface NewOutlineItemPageModel {
  readonly context: EditorContext;
  readonly section: 'pokyny' | 'hospodareni';
}

/** The headmaster only; a Monday outside the calendar is a 404 too. */
async function readContext(datum: string): Promise<EditorContext | null> {
  const viewer = await getViewer();
  if (!viewer || !can(viewer.actor, { action: 'issue.edit' })) return null;
  const read = orNotFound(
    'outline.read',
    await runRegistered(getContainer(), readOutline, {
      principal: viewer,
      requestId: await requestId(),
      input: { monday: datum },
    }),
  );
  if (read === null) return null;
  return {
    meeting: formatTitleDate(parseIsoDate(read.meetingDate)),
    monday: read.monday,
    version: read.version,
    schoolYear: schoolYear(parseIsoDate(read.meetingDate)),
  };
}

/** /porada/[datum]/pokyny/[polozka]: one item for editing; a proposal row sends the page to its review. */
export async function outlineItemPage(
  datum: string,
  lineageId: string,
): Promise<OutlineItemPageModel | null> {
  const viewer = await getViewer();
  const context = await readContext(datum);
  if (!viewer || context === null) return null;
  const item = orNotFound(
    'outline.item',
    await runRegistered(getContainer(), readOutlineItem, {
      principal: viewer,
      requestId: await requestId(),
      input: { monday: datum, lineageId },
    }),
  );
  if (item === null) return null;
  const stored = parseRichDoc(item.body, 'outline');
  if (item.proposal !== null) return { kind: 'proposal', pointId: item.proposal.pointId };
  // The item was read after the context: a write in between would make the version stale, which the save refuses.
  return {
    kind: 'item',
    context: { ...context, version: item.version },
    item: {
      lineageId: item.lineageId,
      section: item.section,
      slot: item.slot,
      persistence: item.persistence,
      title: item.title,
      body: stored.ok ? stored.doc : emptyRichDoc(),
      quotes: item.quotes,
    },
  };
}

/** /porada/[datum]/pokyny/nova: an empty item for a section. */
export async function newOutlineItemPage(
  datum: string,
  section: 'pokyny' | 'hospodareni',
): Promise<NewOutlineItemPageModel | null> {
  const context = await readContext(datum);
  return context === null ? null : { context, section };
}

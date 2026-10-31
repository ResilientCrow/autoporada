import { readOutline } from '@/application/use-cases';
import { formatNumericDate, formatTitleDate } from '@/domain/cs';
import { can } from '@/domain/policy';
import { parseIsoDate } from '@/domain/time';
import type { z } from 'zod';

import type { outlineReadOutput } from '@/contracts';

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

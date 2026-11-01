import { readIssueTexts } from '@/application/use-cases';
import { formatTitleDate } from '@/domain/cs';
import { can } from '@/domain/policy';
import { emptyRichDoc, parseRichDoc, type RichDoc } from '@/domain/richtext';
import { parseIsoDate } from '@/domain/time';
import type { z } from 'zod';

import type { issueTextsOutput } from '@/contracts';

import { runPage } from './run-page';

import { orNotFound } from './not-found';
import { getViewer, requestId } from './viewer';

type Read = z.output<typeof issueTextsOutput>;

/** /porada/[datum]/udaje and /priloha-2: the texts of one porada and the version of its row. */
export interface IssueTextsPageModel {
  /** „pondělí 9. listopadu 2026“. */
  readonly meeting: string;
  readonly monday: string;
  readonly version: number | null;
  readonly present: string;
  readonly guests: string;
  readonly annex2: RichDoc;
  readonly carried: Read['carried'];
}

/** The headmaster only; a Monday outside the calendar is a 404 too. */
export async function issueTextsPage(datum: string): Promise<IssueTextsPageModel | null> {
  const viewer = await getViewer();
  if (!viewer || !can(viewer.actor, { action: 'issue.edit' })) return null;
  const read = orNotFound(
    'issues.texts',
    await runPage(readIssueTexts, {
      principal: viewer,
      requestId: await requestId(),
      input: { monday: datum },
    }),
  );
  if (read === null) return null;
  const annex2 = parseRichDoc(read.annex2, 'outline');
  return {
    meeting: formatTitleDate(parseIsoDate(read.meetingDate)),
    monday: read.monday,
    version: read.version,
    present: read.present,
    guests: read.guests,
    annex2: annex2.ok ? annex2.doc : emptyRichDoc(),
    carried: read.carried,
  };
}

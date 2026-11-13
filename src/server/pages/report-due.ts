import type { z } from 'zod';

import type { UserPrincipal } from '@/application/ports';
import { owedReports } from '@/application/use-cases';
import type { owedReportsOutput } from '@/contracts';
import { can } from '@/domain/policy';
import { POINT_TYPES, type PointTypeId } from '@/domain/report';

import { getContainer } from '../container';
import { runPage } from './run-page';

import { orNotFound } from './not-found';
import { requestId } from './viewer';

/**
 * An akce that has ended and whose porada waits for its report, as the card shows it: the porada,
 * the close, whether the close has passed, and the draft or returned report to go on with.
 */
type ReportDueItem = z.output<typeof owedReportsOutput>['items'][number] & {
  readonly overdue: boolean;
};

/** „Akce čekající na zprávu“: the akce to write a report on, and the types a report can be on. */
export interface ReportDueModel {
  readonly items: readonly ReportDueItem[];
  readonly types: readonly { readonly id: PointTypeId; readonly name: string }[];
}

/**
 * The card of the home page and „Moje body“, or null for whoever may not start items and where a
 * read is refused (the page goes on without it). The author's ended akce whose open porada still
 * prints their report, until it is handed in (`future.owedReports`, ADR 0052).
 */
export async function reportDueOf(viewer: UserPrincipal): Promise<ReportDueModel | null> {
  if (!can(viewer.actor, { action: 'future.create' })) return null;
  const owed = await runPage(owedReports, {
    principal: viewer,
    requestId: await requestId(),
    input: {},
  });
  const read = orNotFound('future.owedReports', owed);
  if (read === null) return null;
  const now = getContainer().app.clock.now().getTime();
  return {
    items: read.items.map((item) => ({
      ...item,
      overdue: new Date(item.closesAt).getTime() <= now,
    })),
    types: POINT_TYPES.map(({ id, name }) => ({ id, name })),
  };
}

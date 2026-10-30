import type { UserPrincipal } from '@/application/ports';
import { listFuture, listPointTypes } from '@/application/use-cases';
import { can } from '@/domain/policy';
import { reportDue } from '@/domain/review';
import { instantToWallClock, parseIsoDate } from '@/domain/time';

import { getContainer } from '../container';
import { runRegistered } from '../pipeline';

import { orNotFound } from './not-found';
import { requestId } from './viewer';

/** An akce that has ended and waits for its report, as much of it as the card shows. */
interface ReportDueItem {
  readonly id: string;
  readonly title: string;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly timeFrom: string | null;
  readonly timeTo: string | null;
}

/** „Akce čekající na zprávu“: the akce to write a report on, and the types a report can be on. */
export interface ReportDueModel {
  readonly items: readonly ReportDueItem[];
  readonly types: readonly { readonly id: string; readonly name: string }[];
}

/**
 * The card of the home page and „Moje body“, or null for whoever may not start items and where a
 * read is refused (the page goes on without it). The card has no items once the last is dealt
 * with and is still given, since the client that says the decision went through must outlive the
 * refresh. Only the newest page of the list is read: an akce the author has not touched for as
 * long as two hundred changes of the school fall off it.
 */
export async function reportDueOf(viewer: UserPrincipal): Promise<ReportDueModel | null> {
  if (!can(viewer.actor, { action: 'future.create' })) return null;
  const [future, listed] = await Promise.all([
    runRegistered(getContainer(), listFuture, {
      principal: viewer,
      requestId: await requestId(),
      input: {},
    }),
    runRegistered(getContainer(), listPointTypes, {
      principal: viewer,
      requestId: await requestId(),
      input: {},
    }),
  ]);
  const rows = orNotFound('future.list', future);
  const types = orNotFound('pointTypes.list', listed);
  if (rows === null || types === null) return null;
  const today = instantToWallClock(getContainer().app.clock.now()).date;
  return {
    items: rows.items.flatMap((row) => {
      const lastDay = row.endDate ?? row.startDate;
      const owed =
        row.isAuthor &&
        lastDay !== null &&
        reportDue({ ...row, lastDay: parseIsoDate(lastDay) }, today);
      const { id, title, startDate, endDate, timeFrom, timeTo } = row;
      return owed ? [{ id, title, startDate, endDate, timeFrom, timeTo }] : [];
    }),
    types: types.types.map(({ id, name }) => ({ id, name })),
  };
}

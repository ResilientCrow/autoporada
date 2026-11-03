'use client';

import { future } from '@/ui/copy';
import { NoScriptNotice } from '@/ui/form';
import { Card } from '@/ui/kit';

import type { StartFutureReportAction } from './actions';
import { ReportDueRow, type ReportDueItem } from './ReportDueRow';

export type { ReportDueItem } from './ReportDueRow';

/**
 * „Akce čekající na zprávu“ (design section 12), on the home page and at the top of „Moje body“:
 * the author's approved akce that have ended, each of which owes a report until it is written
 * (ADR 0048). With nothing waiting there is no card, unless the page asks to `showEmpty`: the top of
 * „Moje body“ and „Přidání akcí“ say that nothing is to be written (ADR 0052).
 */
export function ReportDueCard({
  items,
  types,
  startFutureReport,
  showEmpty = false,
}: {
  readonly items: readonly ReportDueItem[];
  /** The types a report can be on, in the order the chooser lists them. */
  readonly types: readonly { readonly id: string; readonly name: string }[];
  readonly startFutureReport: StartFutureReportAction;
  /** Keep the card, with a sentence saying there is nothing to write, when no akce is waiting. */
  readonly showEmpty?: boolean;
}) {
  if (items.length === 0) {
    return showEmpty ? (
      <Card title={future.report.title}>
        <p>{future.report.empty}</p>
      </Card>
    ) : null;
  }
  return (
    <Card title={future.report.title}>
      <NoScriptNotice />
      <ul className="space-y-4">
        {items.map((item) => (
          <ReportDueRow
            key={item.id}
            item={item}
            types={types}
            startFutureReport={startFutureReport}
          />
        ))}
      </ul>
    </Card>
  );
}

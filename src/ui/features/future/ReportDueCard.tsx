'use client';

import { useRef, useState } from 'react';

import { future } from '@/ui/copy';
import { LiveStatus, NoScriptNotice, useFocusOnRise } from '@/ui/form';
import { Card } from '@/ui/kit';

import type { DeclineFutureReportAction, StartFutureReportAction } from './actions';
import { ReportDueRow, type ReportDueItem } from './ReportDueRow';

export type { ReportDueItem } from './ReportDueRow';

/**
 * „Akce čekající na zprávu“ (design section 12), on the home page and at the top of „Moje body“:
 * the author's approved akce that have ended and expect a report. The page refresh that follows
 * a decline drops the akce, and the button pressed goes with it, so this card, which stays
 * mounted even with nothing left to show, says it in its status region and sends focus to its
 * heading. Where nothing was ever waiting only the empty region is rendered.
 */
export function ReportDueCard({
  items,
  types,
  startFutureReport,
  declineFutureReport,
}: {
  readonly items: readonly ReportDueItem[];
  /** The types a report can be on, in the order the chooser lists them. */
  readonly types: readonly { readonly id: string; readonly name: string }[];
  readonly startFutureReport: StartFutureReportAction;
  readonly declineFutureReport: DeclineFutureReportAction;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [said, setSaid] = useState({ message: '', count: 0 });
  useFocusOnRise(heading, said.count);
  const status = <LiveStatus message={said.message} count={said.count} />;
  if (items.length === 0 && said.count === 0) return status;
  return (
    <Card title={future.report.title} headingRef={heading}>
      {items.length > 0 && <NoScriptNotice />}
      {items.length === 0 ? null : (
        <ul className="space-y-4">
          {items.map((item) => (
            <ReportDueRow
              key={item.id}
              item={item}
              types={types}
              startFutureReport={startFutureReport}
              declineFutureReport={declineFutureReport}
              onDeclined={(title) =>
                setSaid((s) => ({ message: future.report.declined(title), count: s.count + 1 }))
              }
            />
          ))}
        </ul>
      )}
      {status}
    </Card>
  );
}

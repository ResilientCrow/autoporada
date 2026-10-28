import type { ReactNode } from 'react';

import type { PointKind } from '@/domain/report';
import type { PointState } from '@/domain/review';

import type { PointContentWire } from './fields';
import { PointFacts, type PointFactsView } from './PointFacts';
import { PointHeader } from './PointHeader';
import { PointReadContent } from './PointReadContent';
import { Timeline, type TimelineEntry } from './Timeline';

/** What /kontrola/[id] hands the screen: the header, the facts and the read view of the point. */
interface PointReviewModel {
  readonly kind: PointKind;
  readonly state: PointState;
  readonly title: string;
  readonly typeName: string | null;
  readonly facts: PointFactsView;
  readonly read: {
    readonly content: PointContentWire;
    readonly schoolYear: string;
    /** Newest first. */
    readonly timeline: readonly TimelineEntry[];
  };
}

/**
 * A point under review (design section 10): the read view the author's page shows, with the
 * reviewer's decision bar between the content and the history. The page fills `bar`.
 */
export function PointReview({
  point,
  bar,
}: {
  readonly point: PointReviewModel;
  readonly bar?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <PointHeader
        kind={point.kind}
        state={point.state}
        title={point.title}
        typeName={point.typeName}
      />
      <PointFacts facts={point.facts} />
      <PointReadContent
        kind={point.kind}
        content={point.read.content}
        schoolYear={point.read.schoolYear}
      />
      {bar}
      <Timeline entries={point.read.timeline} />
    </div>
  );
}

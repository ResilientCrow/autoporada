'use client';

import { useRef } from 'react';

import type { BulletSpec, PointKind } from '@/domain/report';
import { points } from '@/ui/copy';
import { ErrorSummary, useFocusOnRise, type SummaryEntry } from '@/ui/form';
import { Button } from '@/ui/kit';

import type { PointContentWire } from './fields';
import { ReadinessList } from './ReadinessList';
import type { StandingInput } from './standing';
import { StandingLine } from './StandingLine';

/**
 * The end of the form (design sections 6 and 9): the problems of the last press as an error
 * summary that takes focus when `attempt` rises, the live readiness list, the line saying which
 * porada the point goes to and when it closes (an author at the bottom of a long form sees the
 * deadline, late or not, before pressing), and the sticky bar with
 * „Odeslat ke kontrole“, which is never disabled for what is missing: a press with problems says what they are.
 * Only a banner that holds the editor disables it.
 */
export function SubmitPanel({
  kind,
  content,
  spec,
  schoolYear,
  standing,
  summary,
  attempt,
  pending,
  held,
  onSubmit,
}: {
  readonly kind: PointKind;
  readonly content: PointContentWire;
  readonly spec: readonly BulletSpec[];
  readonly schoolYear: string;
  /** Where the point goes and when that closes; null while no porada is open or the calendar is unknown. */
  readonly standing: StandingInput | null;
  /** What the last press found wrong; null before a press and after a send that went through. */
  readonly summary: readonly SummaryEntry[] | null;
  /** Rises on every press that found problems. */
  readonly attempt: number;
  readonly pending: boolean;
  /** A banner holds the editor (conflict, locked, signed out): the press would do nothing until it is answered. */
  readonly held: boolean;
  readonly onSubmit: () => void;
}) {
  const lead = useRef<HTMLDivElement>(null);
  useFocusOnRise(lead, attempt);
  return (
    <div className="space-y-4">
      {summary === null || summary.length === 0 ? null : (
        <ErrorSummary items={summary} summaryRef={lead} />
      )}
      <ReadinessList kind={kind} content={content} spec={spec} schoolYear={schoolYear} />
      {standing === null ? null : <StandingLine standing={standing} />}
      <div className="submit-bar sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t-2 border-ink bg-light py-3">
        {/* Disabled for a banner only: its role="alert" text says why, and a press would do nothing. */}
        <Button variant="primary" isPending={pending} isDisabled={held} onPress={onSubmit}>
          {points.submit.button}
        </Button>
      </div>
    </div>
  );
}

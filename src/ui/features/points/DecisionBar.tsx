'use client';

import { useEffect, useRef, useState } from 'react';

import type { ReviewDecision } from '@/domain/review';
import { review } from '@/ui/copy';
import { LiveStatus, NoScriptNotice } from '@/ui/form';

import {
  barChoices,
  REVIEW_HEADING_ID,
  type DecidePointAction,
  type DecisionBarModel,
} from './decision';
import { DecisionPanel } from './DecisionPanel';

/**
 * The reviewer's decision bar on /kontrola/[id] (design section 10) and its host (ADR 0013): the
 * host outlives the version, so its status region is mounted before a decision is said into it,
 * while the form under it is keyed by the version and starts afresh after the refresh (a conflict
 * notice or an open note never outlives the version they were about). After a decision the host
 * says what happened and sends focus to the point's title, which every decision leaves in place
 * (the pressed button or the whole bar may be gone). „Schválit a pokračovat“ says the approval and
 * focuses the title the same way before it opens the next point; that page starts with focus at
 * its top, as any page the app opens does (the route keeps its tab title, so Next.js announces
 * nothing more). Without JavaScript the bar cannot send, and says so once.
 */
export function DecisionBar({
  id,
  version,
  bar,
  decidePoint,
}: {
  readonly id: string;
  readonly version: number;
  readonly bar: DecisionBarModel;
  readonly decidePoint: DecidePointAction;
}) {
  const [said, setSaid] = useState({ message: '', count: 0 });
  const seen = useRef(said.count);
  useEffect(() => {
    if (said.count > seen.current) document.getElementById(REVIEW_HEADING_ID)?.focus();
    seen.current = said.count;
  }, [said.count]);
  const onDecided = (event: ReviewDecision) =>
    setSaid((s) => ({ message: review.decision.said[event], count: s.count + 1 }));

  return (
    <>
      <DecisionPanel
        key={`decision-${version}`}
        id={id}
        version={version}
        bar={bar}
        decidePoint={decidePoint}
        onDecided={onDecided}
      />
      <LiveStatus message={said.message} count={said.count} />
      {barChoices(bar).any && <NoScriptNotice />}
    </>
  );
}

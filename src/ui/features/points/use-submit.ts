'use client';

import { useRef, useState, type RefObject } from 'react';
import type { z } from 'zod';

import type { ServerAction, submitPointInput, submitPointOutput } from '@/contracts';
import type { BulletSpec, PointKind } from '@/domain/report';
import type { SaveAnswer } from '@/ui/form';

import { saveAnswer } from './answers';
import { pointFormSpec } from './editor-form';
import { readinessItems, readinessOf } from './readiness';
import type { Edit } from './report-patch';
import { runPress, NOTHING_SHOWN, withOutcome } from './submit-press';
import { submitOutcome, type SubmitOutcome } from './submit-outcome';

export type SubmitPointAction = ServerAction<
  z.input<typeof submitPointInput>,
  z.output<typeof submitPointOutput>
>;

/**
 * „Odeslat ke kontrole“ for the editor: the press, what it leaves on the page and whether a send
 * is pending. The send carries the content as it stands at the press, after everything typed has
 * been saved, so the server saves and submits in one transaction.
 */
export function useSubmit({
  id,
  kind,
  spec,
  schoolYear,
  latest,
  submitPoint,
  afterLanded,
}: {
  readonly id: string;
  readonly kind: PointKind;
  readonly spec: readonly BulletSpec[];
  readonly schoolYear: string;
  /** The editor's latest edit, for a press that follows a change before the page renders again. */
  readonly latest: RefObject<Edit>;
  readonly submitPoint: SubmitPointAction;
  readonly afterLanded: (
    send: (expectedVersion: number) => Promise<SaveAnswer>,
  ) => Promise<SaveAnswer | null>;
}) {
  const [shown, setShown] = useState(NOTHING_SHOWN);
  const [sending, setPending] = useState(false);
  // Set at once: a second press before the page renders again must not send twice.
  const busy = useRef(false);
  const show = (outcome: SubmitOutcome) => setShown((previous) => withOutcome(previous, outcome));
  const setSending = (value: boolean) => {
    busy.current = value;
    setPending(value);
  };

  const press = () => {
    const { content, bullets } = latest.current;
    const form = pointFormSpec(kind, bullets, spec, content.statements.length);
    return runPress({
      sending: busy.current,
      problems: readinessItems(readinessOf(kind, content, spec, schoolYear), form).problems,
      show,
      setSending,
      send: () =>
        afterLanded(async (expectedVersion) => {
          let result: Awaited<ReturnType<SubmitPointAction>> | null;
          try {
            result = await submitPoint({ id, expectedVersion, content });
          } catch {
            result = null;
          }
          show(submitOutcome(result, form));
          return result === null ? ({ kind: 'failed' } as const) : saveAnswer(result);
        }),
    });
  };

  return {
    sending,
    summary: shown.outcome.summary,
    problem: shown.outcome.problem,
    summaryAttempt: shown.summaryAttempt,
    problemAttempt: shown.problemAttempt,
    press,
  };
}

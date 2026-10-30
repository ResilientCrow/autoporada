'use client';

import { useRef, useState } from 'react';

import type { ActionResult } from '@/contracts';
import type { FutureKind } from '@/domain/calendar';
import type { SaveAnswer } from '@/ui/form';

import { NO_OUTCOME, NOTHING_SHOWN, outcomeOf, withOutcome } from './outcome';

/** What a send tells the hook of the server's answer; null when the call itself failed. */
export type Settled = (result: ActionResult<{ readonly version: number }> | null) => void;

/**
 * A press that sends the item in: „Odeslat ke kontrole“ (after the autosave landed) or „Uložit
 * změny“ of an approved akce. It holds what the answer left on the form and whether a send is on
 * its way. A send that went through stays pending until the page refreshes; a banner (null), a
 * failure, a conflict or a refusal ends it. `banners` says whether the autosave's banners own some
 * answers (the submit); a revise has none and shows everything.
 */
export function useSend({
  kind,
  banners,
  call,
}: {
  readonly kind: FutureKind;
  readonly banners: boolean;
  /** Makes the call and reports its answer to `settled`. */
  readonly call: (settled: Settled) => Promise<SaveAnswer | null>;
}) {
  const [shown, setShown] = useState(NOTHING_SHOWN);
  const [sending, setPending] = useState(false);
  // Set at once: a second press before the page renders again must not send twice.
  const busy = useRef(false);
  const setSending = (value: boolean) => {
    busy.current = value;
    setPending(value);
  };
  const settled: Settled = (result) =>
    setShown((previous) => withOutcome(previous, outcomeOf(result, kind, banners)));

  const press = async () => {
    if (busy.current) return;
    setSending(true);
    setShown((previous) => withOutcome(previous, NO_OUTCOME));
    const answer = await call(settled);
    if (answer?.kind !== 'ok') setSending(false);
  };
  return { sending, shown, press };
}

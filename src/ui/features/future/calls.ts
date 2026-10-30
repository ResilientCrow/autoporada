import type { z } from 'zod';

import type { ActionResult, saveFutureOutput } from '@/contracts';
import type { FutureKind } from '@/domain/calendar';
import { saveAnswerOf, statusAnswerOf, type SaveAnswer, type StatusAnswer } from '@/ui/form';

import type { FutureContentWire } from './edit';

/** „Uložit změny“ of an approved akce: the page's version, the content held, and the intent. */
export const reviseInput = (id: string, version: number, content: FutureContentWire) => ({
  id,
  expectedVersion: version,
  content,
  intent: 'revise' as const,
});

/** „Odeslat ke kontrole“: the version the autosave landed, not the page's. */
export const submitInput = (id: string, landed: number, content: FutureContentWire) => ({
  id,
  expectedVersion: landed,
  content,
});

/** „Stáhnout“: the item and the version the page showed. */
export const retractInput = (id: string, version: number) => ({ id, expectedVersion: version });

/** „Začít“: the kind chosen and the `clientRef` the first press made, kept for every retry. */
export function createInput(
  held: { current: string | null },
  kind: FutureKind,
  make: () => string,
): { readonly clientRef: string; readonly kind: FutureKind } {
  held.current ??= make();
  return { clientRef: held.current, kind };
}

/** What the revise's press does with the server's answer (`null`: the call itself failed). */
export interface ReviseEffect {
  /** The akce moved on, so the page must show it (the save does not refresh, ADR 0017). */
  readonly refresh: boolean;
  /** The server found nothing to change and kept the akce approved: say so. */
  readonly unchanged: boolean;
  /** For the send: `null` ends it with no banner. Anything but `ok` ends it too. */
  readonly answer: SaveAnswer | null;
}

export function reviseEffect(
  result: ActionResult<z.output<typeof saveFutureOutput>> | null,
): ReviseEffect {
  if (result === null) return { refresh: false, unchanged: false, answer: { kind: 'failed' } };
  const answer = saveAnswerOf(result, 'future-not-editable');
  // An unchanged akce stays approved: the page is as it was, and the send must end here.
  if (result.ok && result.data.state === 'approved') {
    return { refresh: false, unchanged: true, answer: null };
  }
  return { refresh: result.ok, unchanged: false, answer };
}

/** The send's answer for a submit: the server's, or a failure where the call itself failed. */
export const submitAnswer = (
  result: ActionResult<{ readonly version: number }> | null,
): SaveAnswer =>
  result === null ? { kind: 'failed' } : saveAnswerOf(result, 'future-not-editable');

/**
 * The check after a conflict. `future.get` says an approved item is editable for its author, but
 * the autosave only ever saves a draft or a returned one: an approved item is locked to it.
 */
export function editorStatusOf(
  result: ActionResult<{
    readonly version: number;
    readonly editable: boolean;
    readonly state: string;
  }>,
): StatusAnswer {
  if (!result.ok) return statusAnswerOf(result);
  const { version, editable, state } = result.data;
  return statusAnswerOf({
    ok: true,
    data: { version, editable: editable && (state === 'draft' || state === 'returned') },
  });
}

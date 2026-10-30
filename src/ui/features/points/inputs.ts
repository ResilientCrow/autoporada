import type { z } from 'zod';

import type { createPointInput } from '@/contracts';
import { PROPOSAL_KINDS } from '@/domain/report';
import { choiceOf, textOf } from '@/ui/form';

/**
 * What „Začít“ sends: a report of the chosen type under the page's `clientRef`.
 * No choice sends no type, which the server answers with the field issue.
 */
export function startInput(data: FormData, clientRef: string): z.input<typeof createPointInput> {
  return { clientRef, kind: 'report', typeId: textOf(data, 'typeId') || null };
}

/**
 * What „Začít“ sends on /navrhy/novy: a proposal of the chosen kind, which has no type, under the
 * page's `clientRef`. The radio group always has a kind checked, so a missing one is a bug.
 */
export function proposalInput(data: FormData, clientRef: string): z.input<typeof createPointInput> {
  return { clientRef, kind: choiceOf(data, 'kind', PROPOSAL_KINDS), typeId: null };
}

/**
 * The page's `clientRef`: made on the first press and the same on every later
 * one, so a retry after a failure returns the draft the first press made.
 */
export function keepRef(holder: { current: string | null }, make: () => string): string {
  holder.current ??= make();
  return holder.current;
}

import type { z } from 'zod';

import type {
  ActionResult,
  reviewEditPointInput,
  reviewEditPointOutput,
  ServerAction,
} from '@/contracts';
import type { Problem } from '@/ui/form';

export type ReviewEditAction = ServerAction<
  z.input<typeof reviewEditPointInput>,
  z.output<typeof reviewEditPointOutput>
>;

/**
 * What „Uložit úpravy“ leads to: the edit went through (`saved`), there was nothing to save
 * (`unchanged`), the fields show what to fix (`invalid`), or the editor's one problem notice says
 * what went wrong.
 */
export type ReviewEditOutcome =
  | { readonly kind: 'saved' | 'unchanged' | 'invalid' }
  | { readonly kind: 'problem'; readonly problem: Problem };

const problem = (value: Problem): ReviewEditOutcome => ({ kind: 'problem', problem: value });

/**
 * The server's answer to a review edit (`null`: the call failed). Field issues stay inline under
 * their fields, as the author's editor shows them. A conflict keeps its reload; a point that moved
 * on keeps the locked wording; a refusal means the point left the viewer's reach, so it reads as
 * the point being gone, as the decision bar says it.
 */
export function reviewEditOutcome(
  result: ActionResult<z.output<typeof reviewEditPointOutput>> | null,
): ReviewEditOutcome {
  if (result === null) return problem({ code: 'network' });
  if (result.ok) return { kind: result.data.changed ? 'saved' : 'unchanged' };
  const { error } = result;
  if (error.code === 'invalid-input') {
    return Object.keys(error.fields).length === 0
      ? problem({ code: 'invalid-input' })
      : { kind: 'invalid' };
  }
  if (error.code === 'forbidden') return problem({ code: 'not-found' });
  return problem(error);
}

/**
 * What the review page shows around the bar. The open editor takes the read view's place, and the
 * decision bar goes while it is open: a decision is never made over edits not yet saved, and the
 * editor's own „Uložit úpravy“ or „Zrušit úpravy“ closes it first. An editor the page did not
 * give (`editable` false) never opens.
 */
export function reviewHost(editing: boolean, editable: boolean) {
  const editor = editing && editable;
  return { editor, read: !editor, bar: !editor };
}

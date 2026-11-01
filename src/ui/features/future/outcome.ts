import type { ActionError, ActionResult, FieldIssues } from '@/contracts';
import type { FormState, Problem } from '@/ui/form';

import { issuesOf, type FutureContentWire } from './edit';

/** What a send leaves on the form: the fields the server refused, or one problem, or nothing. */
export interface Outcome {
  readonly issues: FieldIssues | null;
  readonly problem: Problem | null;
}

export const NO_OUTCOME: Outcome = { issues: null, problem: null };

/** The answers the autosave banners own: a conflict, a moved state, a missing item, a lost session. */
function bannerOwns(error: ActionError): boolean {
  if (error.code === 'rule') return error.rule === 'future-not-editable';
  return (
    error.code === 'conflict' || error.code === 'not-found' || error.code === 'unauthenticated'
  );
}

/**
 * The refusals of the order of two values, when the value they follow is missing, as a request for
 * that value: an end date without a start date, an end time without a start time. The contract's
 * wording („konec nesmí být před začátkem“) would be wrong for them.
 */
function missingFirst(known: FieldIssues, content: FutureContentWire): FieldIssues {
  const { endDate, timeTo, ...rest } = known;
  return {
    ...rest,
    ...(endDate !== undefined &&
      (content.startDate === null ? { startDate: 'required' } : { endDate })),
    ...(timeTo !== undefined &&
      (content.timeFrom === null ? { timeFrom: 'required' } : { timeTo })),
  };
}

/**
 * What to show of the server's answer to a submit or a revise (`null`: the call failed). With
 * `banners` (the submit, which waits for the autosave) its banners own the answers they show, so
 * none shows twice; a revise has no autosave, so it shows everything itself. `content` is what
 * was sent.
 */
export function outcomeOf(
  result: ActionResult<{ readonly version: number }> | null,
  banners: boolean,
  content: FutureContentWire,
): Outcome {
  if (result === null) return { issues: null, problem: { code: 'network' } };
  if (result.ok) return NO_OUTCOME;
  const { error } = result;
  if (banners && bannerOwns(error)) return NO_OUTCOME;
  if (error.code !== 'invalid-input') return { issues: null, problem: error };
  const { known } = issuesOf(error.fields);
  // Fields to point at beat the generic notice, which only says that something was refused.
  if (Object.keys(known).length === 0) return { issues: null, problem: { code: 'invalid-input' } };
  return { issues: missingFirst(known, content), problem: null };
}

/** What the last send left on the form, and a count that rises when a lead should take focus. */
export interface Shown {
  readonly outcome: Outcome;
  /** Rises with each outcome that has issues or a problem: the form's lead takes focus. */
  readonly attempt: number;
}

export const NOTHING_SHOWN: Shown = { outcome: NO_OUTCOME, attempt: 0 };

/** The form after `outcome` is shown. */
export function withOutcome(previous: Shown, outcome: Outcome): Shown {
  const leads = outcome.issues !== null || outcome.problem !== null;
  return { outcome, attempt: previous.attempt + (leads ? 1 : 0) };
}

/**
 * The form's state in an autosaving editor: what the last send left on it, and a submit that
 * does nothing, since Enter in a field must not send the item in. Only the buttons send.
 */
export function formStateOf({ outcome, attempt }: Shown): FormState {
  return {
    issues: outcome.issues,
    problem: outcome.problem,
    attempt,
    submitting: null,
    onSubmit: (event) => event.preventDefault(),
  };
}

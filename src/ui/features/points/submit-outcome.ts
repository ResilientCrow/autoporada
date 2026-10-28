import type { z } from 'zod';

import type { ActionResult, submitPointOutput } from '@/contracts';
import { fieldIssues } from '@/ui/copy';
import { fieldId, type FormSpec, type Problem, type SummaryEntry } from '@/ui/form';

import { EDITOR_FORM_ID } from './editor-form';
import { readinessTarget } from './readiness';

/** What a send leaves on the page: a summary of fields, or one problem, or (banners, success) nothing. */
export interface SubmitOutcome {
  readonly summary: readonly SummaryEntry[] | null;
  readonly problem: Problem | null;
}

/** Nothing to show. */
export const NO_OUTCOME: SubmitOutcome = { summary: null, problem: null };

/** A field the server refused, as the summary lists it: „Label: message“ linked to its control, or the bare message. */
function entry(path: string, code: keyof typeof fieldIssues, form: FormSpec): SummaryEntry {
  const name = readinessTarget(path, form);
  const message = fieldIssues[code];
  if (name === null) return { id: null, text: message };
  return { id: fieldId(EDITOR_FORM_ID, name), text: `${form[name]?.label ?? ''}: ${message}` };
}

/**
 * What to show of the server's answer to a submit (`null`: the call failed). The server checks
 * what the readiness list checked, so its field issues are the backstop for a disagreement and
 * read generically. The autosave banners own a conflict, a state that moved, a missing point and
 * a lost session, so none of those shows anything here.
 */
export function submitOutcome(
  result: ActionResult<z.output<typeof submitPointOutput>> | null,
  form: FormSpec,
): SubmitOutcome {
  if (result === null) return { summary: null, problem: { code: 'network' } };
  if (result.ok) return NO_OUTCOME;
  const { error } = result;
  switch (error.code) {
    case 'invalid-input': {
      const paths = Object.entries(error.fields);
      if (paths.length === 0) return { summary: null, problem: { code: 'invalid-input' } };
      return { summary: paths.map(([path, code]) => entry(path, code, form)), problem: null };
    }
    case 'conflict':
    case 'not-found':
    case 'unauthenticated':
      return NO_OUTCOME;
    case 'rule':
      return error.rule === 'point-not-editable' ? NO_OUTCOME : { summary: null, problem: error };
    case 'busy':
    case 'forbidden':
    case 'rate-limited':
    case 'step-up-required':
    case 'unavailable':
      return { summary: null, problem: error };
  }
}

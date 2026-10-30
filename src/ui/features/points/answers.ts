import type { z } from 'zod';

import type { ActionResult, pointStatusOutput, savePointOutput } from '@/contracts';
import { saveAnswerOf, statusAnswerOf, type SaveAnswer, type StatusAnswer } from '@/ui/form';

/** What the autosave machine hears of a save: the server's answer in its own words. */
export function saveAnswer(result: ActionResult<z.output<typeof savePointOutput>>): SaveAnswer {
  return saveAnswerOf(result, 'point-not-editable');
}

/** The same for the check after a conflict. */
export function statusAnswer(
  result: ActionResult<z.output<typeof pointStatusOutput>>,
): StatusAnswer {
  return statusAnswerOf(result);
}

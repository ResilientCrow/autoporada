import type { z } from 'zod';

import type { ActionResult, FieldIssues, savePointOutput } from '@/contracts';
import { fieldIssues, points } from '@/ui/copy';
import type { Problem } from '@/ui/form';

import { EDITOR_SPEC } from './editor-form';
import type { PointContentWire } from './fields';

/** What the editor shows of a refused save: a message under the fields it names, and a notice for the rest. */
export interface SaveIssues {
  readonly messages: Readonly<Record<string, string>>;
  readonly problem: Problem | null;
}

/** The contract reports a field of the content as `content.<name>`. */
const PREFIX = 'content.';
const NOTICE: Problem = { code: 'invalid-input' };

function endDateMessage(content: PointContentWire): string {
  return content.eventDate ? points.editor.endBeforeStart : points.editor.endWithoutStart;
}

/**
 * The field issues of a refused save as the editor shows them, inline only (no summary,
 * no focus). The contract refuses an end date before the start or with no start on
 * `content.endDate`; the other fields say what their code says. An issue on no field of
 * the editor (the content as a whole, a path of a later row) or an answer with no issue at
 * all becomes the problem notice.
 */
export function saveIssues(fields: FieldIssues, content: PointContentWire): SaveIssues {
  const messages: Record<string, string> = {};
  let problem: Problem | null = Object.keys(fields).length === 0 ? NOTICE : null;
  for (const [path, code] of Object.entries(fields)) {
    const name = path.startsWith(PREFIX) ? path.slice(PREFIX.length) : '';
    if (!Object.hasOwn(EDITOR_SPEC, name)) problem = NOTICE;
    else messages[name] = name === 'endDate' ? endDateMessage(content) : fieldIssues[code];
  }
  return { messages, problem };
}

/**
 * The issues to keep after a save: the newest refusal replaces the older, a saved answer
 * clears them, and any other answer says nothing about the text, so they stay.
 */
export function issuesAfter(
  previous: FieldIssues | null,
  result: ActionResult<z.output<typeof savePointOutput>>,
): FieldIssues | null {
  if (result.ok) return null;
  return result.error.code === 'invalid-input' ? result.error.fields : previous;
}

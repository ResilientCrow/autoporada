import type { z } from 'zod';

import type { ActionResult, FieldIssueCode, FieldIssues, savePointOutput } from '@/contracts';
import type { BulletSpec } from '@/domain/report';
import { fieldIssues, points } from '@/ui/copy';
import type { Problem } from '@/ui/form';

import { editorSpec } from './editor-form';
import type { PointContentWire } from './fields';

/**
 * What the editor shows of a refused save: a message under the fields it names, and for
 * the rest either `notice` (the content as a whole is too long: text of its own) or the
 * generic `problem`. A refusal of the content as a whole sets only the notice; an issue
 * on no control sets only the problem; both are set when a refusal holds one of each
 * (`{ content: 'too-long', id: '…' }`).
 */
export interface SaveIssues {
  readonly messages: Readonly<Record<string, string>>;
  readonly problem: Problem | null;
  readonly notice: string | null;
}

/** The contract reports a field of the content as `content.<name>`. */
const PREFIX = 'content.';
const NOTICE: Problem = { code: 'invalid-input' };

function endDateMessage(content: PointContentWire): string {
  return content.eventDate ? points.editor.endBeforeStart : points.editor.endWithoutStart;
}

/** The contract reports the content's size on the path `content` itself. */
const WHOLE = 'content';

/**
 * The message for one issue: the end date has two stories. A people row the save refuses has too
 * many people; one a review edit's readiness asks for (`required`) says so as any field does.
 */
function messageFor(name: string, code: FieldIssueCode, content: PointContentWire): string {
  if (name === 'endDate') return endDateMessage(content);
  if (code !== 'required' && /^bullets\.\d+\.people$/.test(name)) {
    return points.bullets.tooManyPeople;
  }
  return fieldIssues[code];
}

/**
 * The field issues of a refused save as the editor shows them, inline only (no summary,
 * no focus). The contract refuses an end date before the start or with no start on
 * `content.endDate`; the other fields, a bullet's controls among them, say what their
 * code says. The content being over its size cap has a notice of its own. An issue on
 * no control of the editor (a path of a later row, a bullet that is gone) or an answer
 * with no issue at all becomes the generic problem notice.
 */
export function saveIssues(
  fields: FieldIssues,
  content: PointContentWire,
  bulletSpec: readonly BulletSpec[],
): SaveIssues {
  const spec = editorSpec(content.bullets, bulletSpec, content.statements.length);
  const messages: Record<string, string> = {};
  let problem: Problem | null = Object.keys(fields).length === 0 ? NOTICE : null;
  let notice: string | null = null;
  for (const [path, code] of Object.entries(fields)) {
    const name = path.startsWith(PREFIX) ? path.slice(PREFIX.length) : '';
    if (path === WHOLE && code === 'too-long') notice = points.editor.tooLong;
    else if (!Object.hasOwn(spec, name)) problem = NOTICE;
    else messages[name] = messageFor(name, code, content);
  }
  return { messages, problem, notice };
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

/** The issues without those whose path starts with `prefix`; nothing left is null (an empty set would read as a refusal that names nothing). */
function without(previous: FieldIssues, prefix: string): FieldIssues | null {
  const kept = Object.entries(previous).filter(([path]) => !path.startsWith(prefix));
  if (kept.length === Object.keys(previous).length) return previous;
  return kept.length === 0 ? null : Object.fromEntries(kept);
}

/** A refused save names bullets by their place: `content.bullets.2.text`. */
const BULLET_PATH = 'content.bullets.';

/**
 * The issues to keep after the author changed the bullets from `before` to `after`.
 * The refusal names bullets by index, so once a row is added, removed, restored or
 * swapped the indices no longer mean the rows they did and those messages go; an edit
 * inside a row keeps them, like an edit to any other field. Nothing left is null (an
 * empty set would read as a refusal that names nothing).
 */
export function issuesAfterRows(
  previous: FieldIssues | null,
  before: readonly { readonly key: string }[],
  after: readonly { readonly key: string }[],
): FieldIssues | null {
  if (previous === null) return null;
  const same = before.length === after.length && before.every((b, i) => b.key === after[i]?.key);
  return same ? previous : without(previous, BULLET_PATH);
}

/** The statements are named by their place too: `content.statements.1.quote`. */
const STATEMENT_PATH = 'content.statements.';

/**
 * The issues to keep after a statement was added, removed or moved: the indices no longer
 * mean the cards they did, so the statements' messages go. An edit inside a card never
 * comes here, and keeps them.
 */
export function issuesAfterStatementRows(previous: FieldIssues | null): FieldIssues | null {
  return previous === null ? null : without(previous, STATEMENT_PATH);
}

import { DEADLINE_RULE, defineUseCase, fail, fromTransition, ok } from '@/application/core';
import { setSkippedInput, setSkippedOutput } from '@/contracts';
import { skipWindow } from '@/domain/calendar';
import { ISSUE_MACHINE, transition } from '@/domain/review';
import { compareDates, isoWeekday, parseIsoDate, type CalDate } from '@/domain/time';

import { readWindow } from './calendar';
import { ensureIssue } from './ensure';
import { issueEvent } from './events';

const ACTIONS = { skip: 'issue.skipped', unskip: 'issue.unskipped' } as const;
/** What a client that saw no row for the Monday read: an untouched issue. */
const UNTOUCHED_VERSION = 1;

/** The Monday the text names, or null when it is no Monday or is out of the calendar's range. */
function mondayOfText(text: string): CalDate | null {
  try {
    const date = parseIsoDate(text);
    return isoWeekday(date) === 1 ? date : null;
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

/**
 * „Porada se nekoná“ and its undo, for one Monday. The headmaster may
 * skip any Monday from the first one whose deadline is still ahead (frozen
 * deadlines counted, a skipped one too, so it can be undone) up to the
 * last slot Monday, the end of the calendar the placement looks at; an
 * earlier Monday is closed to submissions and can no longer be skipped. A missing row is made first (ADR 0018).
 * Skipping writes no point and sends no mail: placement is computed on read.
 */
export const setSkipped = defineUseCase({
  name: 'issues.setSkipped',
  mode: 'write',
  input: setSkippedInput,
  output: setSkippedOutput,
  access: { kind: 'gate', check: () => ({ action: 'issue.generate' }) },
  async execute({ tx, actor, now }, input) {
    if (!input.confirmed) return fail({ code: 'invalid-input', fields: { confirmed: 'required' } });
    const monday = mondayOfText(input.monday);
    if (!monday) return fail({ code: 'invalid-input', fields: { monday: 'invalid' } });

    const { slots } = await readWindow(tx, now);
    const { first, last } = skipWindow(now, slots, DEADLINE_RULE);
    if (compareDates(monday, first) < 0 || compareDates(monday, last) > 0) {
      return fail({ code: 'invalid-input', fields: { monday: 'invalid' } });
    }

    const { issue } = await ensureIssue(tx, monday);
    if (issue.version !== (input.expectedVersion ?? UNTOUCHED_VERSION)) {
      return fail({ code: 'conflict' });
    }
    const step = transition(ISSUE_MACHINE, issue.status, input.event, {
      kind: 'user',
      role: actor.role,
      isAuthor: false,
    });
    if (!step.ok) return fromTransition(step);

    const after = await tx.issues.setStatus(issue.id, issue.version, step.to);
    await tx.audit.record(issueEvent(ACTIONS[input.event], issue, after));
    return ok({ status: after.status, version: after.version });
  },
});

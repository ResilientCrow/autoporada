import { defineUseCase, fail, fromTransition, ok } from '@/application/core';
import { setSkippedInput, setSkippedOutput } from '@/contracts';
import { ISSUE_MACHINE, transition } from '@/domain/review';
import { orderConflicts } from '@/domain/calendar';
import { compareDates } from '@/domain/time';

import { mondayOfText, readWindow } from './calendar';
import { ensureIssue } from './ensure';
import { issueEvent } from './events';

const ACTIONS = { skip: 'issue.skipped', unskip: 'issue.unskipped' } as const;
/** What a client that saw no row for the Monday read: an untouched issue. */
const UNTOUCHED_VERSION = 1;

/**
 * „Porada se nekoná“ and its undo, for one slot. The headmaster may skip any slot of the
 * calendar (`readWindow`: from this week's Monday on, or earlier with a meeting still ahead)
 * whatever its deadline: after the deadline the approved points move to the next porada, which
 * the form says. A generated slot has no skip or unskip (refused as `issue-not-open`).
 * An unskip that would break the meeting order is refused (`meeting-order`; the wire carries
 * codes only, so the conflicting slots are not named). A missing row is made first (ADR 0018). Skipping writes no point and sends no mail: placement
 * is computed on read.
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

    const { slots, rule } = await readWindow(tx, now);
    const slot = slots.find((s) => compareDates(s.monday, monday) === 0);
    if (!slot) return fail({ code: 'invalid-input', fields: { monday: 'invalid' } });
    if (slot.status === 'generated') return fail({ code: 'rule', rule: 'issue-not-open' });
    // A porada that takes place again must still fit the order of the others (ADR 0034).
    if (input.event === 'unskip' && slot.status === 'skipped') {
      const back = { ...slot, status: 'open' as const };
      if (orderConflicts(slots, back).length > 0)
        return fail({ code: 'rule', rule: 'meeting-order' });
    }

    const { issue } = await ensureIssue(tx, monday, rule);
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

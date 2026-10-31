import { defineUseCase, fail, ok, readSlots } from '@/application/core';
import type { AuditTarget, Tx } from '@/application/ports';
import { SETTINGS, settingsSaveInput, settingsSaveOutput, toDeadlineRule } from '@/contracts';
import { deadlineChange, lastSlotMonday, refreezable } from '@/domain/calendar';
import { instantToWallClock } from '@/domain/time';

import { ensureIssue } from '../issues';

/**
 * What a new deadline rule does to the issues before it is stored (ADR 0032), in the save's
 * transaction. It first holds the rule against every reader that freezes by it. The Mondays from
 * this week's to the one a hand-in goes to now are frozen with the old rule, so nobody's shown
 * deadline moves; the open rows after it still on the old rule are refrozen with the new one. The
 * same rule changes nothing. Gives the rows it wrote, for the audit event.
 */
async function applyDeadline(tx: Tx, now: Date, value: unknown) {
  const newRule = toDeadlineRule(SETTINGS.deadline.schema.parse(value));
  await tx.settings.lock('deadline', 'update');
  const { slots, rule } = await readSlots(tx, now);
  const change = deadlineChange(now, rule, newRule, slots);
  const frozen: AuditTarget[] = [];
  const refrozen: AuditTarget[] = [];
  if (!change) return { frozen, refrozen };
  for (const monday of change.freeze) {
    const { issue, inserted } = await ensureIssue(tx, monday, rule);
    if (inserted) frozen.push({ type: 'issue', id: issue.id });
  }
  const today = instantToWallClock(now).date;
  const rows = await tx.issues.between(change.from, lastSlotMonday(today));
  for (const { row, deadlineAt } of refreezable(rows, change.from, rule, newRule)) {
    await tx.issues.reschedule(row.id, row.version, { meetingDate: row.meetingDate, deadlineAt });
    refrozen.push({ type: 'issue', id: row.id });
  }
  return { frozen, refrozen };
}

/**
 * The headmaster saves one setting under the version the form read (0: no row yet). A save from a
 * stale form is refused as a conflict, whoever got there first, and freezes nothing. The audit
 * event names the key and never the value: the annex texts are text a person wrote (ADR 0032). A
 * deadline rule also counts the issues it froze and refroze, and names them.
 */
export const saveSettings = defineUseCase({
  name: 'settings.save',
  mode: 'write',
  input: settingsSaveInput,
  output: settingsSaveOutput,
  access: { kind: 'gate', check: () => ({ action: 'settings.manage' }) },
  async execute({ tx, now }, input) {
    const issues = input.key === 'deadline' ? await applyDeadline(tx, now, input.value) : null;
    const version = await tx.settings.save(input.key, input.value, input.version);
    if (version === null) return fail({ code: 'conflict' });
    const related = issues ? [...issues.frozen, ...issues.refrozen] : [];
    await tx.audit.record({
      action: 'settings.saved',
      target: null,
      meta: issues
        ? { key: input.key, frozen: issues.frozen.length, refrozen: issues.refrozen.length }
        : { key: input.key },
      ...(related.length > 0 && { related }),
    });
    return ok({ version });
  },
});

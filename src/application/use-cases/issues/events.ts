import { diffRecords, type AuditShape } from '@/application/core';
import type { AuditEvent, IssueRecord } from '@/application/ports';
import { toIsoDate } from '@/domain/time';

/**
 * What the audit log shows of an issue: its status. The Monday never changes,
 * so it goes in `meta` rather than the diff; the deadline is frozen.
 */
const ISSUE: AuditShape<IssueRecord> = {
  id: 'omit',
  monday: 'omit',
  meetingDate: 'omit',
  schoolYear: 'omit',
  deadlineAt: 'omit',
  status: 'value',
  version: 'omit',
};

/** An issue skipped or unskipped (past tense, as every M8 action). */
export function issueEvent(
  action: `issue.${string}`,
  before: IssueRecord | null,
  after: IssueRecord,
): AuditEvent {
  return {
    action,
    target: { type: 'issue', id: after.id },
    diff: diffRecords(ISSUE, before, after),
    meta: { monday: toIsoDate(after.monday) },
  };
}

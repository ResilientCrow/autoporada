import { diffRecords, type AuditShape } from '@/application/core';
import type { AuditEvent, Json, UserRecord } from '@/application/ports';

/** What the audit log shows of a user's access: role, status and the student flag. */
export const USER_ACCESS: AuditShape<UserRecord> = {
  id: 'omit',
  tid: 'omit',
  oid: 'omit',
  displayName: 'omit',
  email: 'omit',
  jobTitle: 'omit',
  department: 'omit',
  role: 'value',
  isStudent: 'value',
  status: 'value',
  remindDeadline: 'omit',
  version: 'omit',
  createdAt: 'omit',
  updatedAt: 'omit',
};

/** `user.access.change`: a headmaster changed a user's role, status or student flag. */
export function userAccessEvent(
  before: UserRecord,
  after: UserRecord,
  meta: Readonly<Record<string, Json>>,
): AuditEvent {
  return {
    action: 'user.access.change',
    target: { type: 'user', id: after.id },
    diff: diffRecords(USER_ACCESS, before, after),
    meta,
  };
}

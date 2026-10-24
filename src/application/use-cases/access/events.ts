import { diffRecords, type AuditShape } from '@/application/core';
import type { AccessRequestRecord, AuditEvent } from '@/application/ports';

/**
 * What the audit log shows of a request: its state and who decided. Never
 * the reason: it is text the person wrote (plan §4).
 */
const ACCESS_REQUEST: AuditShape<AccessRequestRecord> = {
  id: 'omit',
  userId: 'omit',
  reason: 'omit',
  state: 'value',
  decidedBy: 'value',
  decidedAt: 'omit',
  version: 'omit',
  createdAt: 'omit',
};

/** A request filed or moved on, with the requester as the related row. */
export function accessRequestEvent(
  action: `access.${string}`,
  before: AccessRequestRecord | null,
  after: AccessRequestRecord,
): AuditEvent {
  return {
    action,
    target: { type: 'access_request', id: after.id },
    related: [{ type: 'user', id: after.userId }],
    diff: diffRecords(ACCESS_REQUEST, before, after),
  };
}

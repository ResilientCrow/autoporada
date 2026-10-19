import { diffRecords, type AuditShape } from '@/application/core';
import type { AuditEvent, AuditTarget, Json, UserRecord } from '@/application/ports';

/** What the audit log shows of a user's access: role, status and the student flag. */
const USER_ACCESS: AuditShape<UserRecord> = {
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
  version: 'omit',
  createdAt: 'omit',
  updatedAt: 'omit',
};

const user = (id: string): AuditTarget => ({ type: 'user', id });
const session = (id: string): AuditTarget => ({ type: 'session', id });

/** `auth.login`: the user, the new session and any sessions it replaced. */
export function loginEvent(input: {
  readonly userId: string;
  readonly sessionId: string;
  readonly ended: readonly string[];
  readonly meta: Readonly<Record<string, Json>>;
}): AuditEvent {
  return {
    action: 'auth.login',
    target: user(input.userId),
    related: [session(input.sessionId), ...input.ended.map(session)],
    meta: input.meta,
  };
}

/**
 * `auth.rejected`: a sign-in Entra verified but the app refused. Never the
 * claims themselves, the UPN or the e-mail: only the reason and its codes.
 */
export function rejectedEvent(
  userId: string | null,
  meta: Readonly<Record<string, Json>>,
): AuditEvent {
  return { action: 'auth.rejected', target: userId ? user(userId) : null, meta };
}

export function bootstrapEvent(before: UserRecord, after: UserRecord): AuditEvent {
  return {
    action: 'user.bootstrapHeadmaster',
    target: user(after.id),
    diff: diffRecords(USER_ACCESS, before, after),
    meta: { source: 'BOOTSTRAP_HEADMASTER_OID' },
  };
}

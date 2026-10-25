import {
  DatabaseFailure,
  type AccessRequestRecord,
  type AuditTarget,
  type EnqueueOptions,
  type GateRow,
  type IssueRecord,
  type JobCatalog,
  type JobName,
  type LedgerRow,
  type PendingSignIn,
  type PointRecord,
  type PointTypeRecord,
  type SessionRecord,
  type UserRecord,
} from '@/application/ports';

/** What the fake database holds, mirroring the tables the ports write. */
export interface FakeState {
  readonly users: Map<string, UserRecord>;
  readonly accessRequests: Map<string, AccessRequestRecord>;
  /** auth_transactions, by cookie hash (unique). */
  readonly signIns: Map<string, PendingSignIn>;
  /** sessions, by id; the token digest is kept next to the record. */
  readonly sessions: Map<string, SessionRecord & { readonly tokenSha256: string }>;
  readonly audit: AuditRow[];
  readonly jobs: JobRow[];
  /** issues, by ISO Monday (issues_monday_key). */
  readonly issues: Map<string, IssueRecord>;
  /** point_types, by id. Migration 0014's seeds are not here: a test makes the types it needs. */
  readonly pointTypes: Map<string, PointTypeRecord>;
  /** points, by id; the client ref is kept next to the record. */
  readonly points: Map<string, FakePoint>;
  /** mail_ledger, by dedupe key. */
  readonly mailLedger: Map<string, LedgerRow>;
  /** mail_gate's one row, as migration 0009 inserts it. */
  mailGate: GateRow;
  /** Hands out UUID-shaped ids in order, as uuidv7() would. */
  nextId: number;
}

export type FakePoint = PointRecord & { readonly clientRef: string };

export interface AuditRow {
  readonly actorId: string | null;
  readonly action: string;
  readonly targetType: string | null;
  readonly targetId: string | null;
  readonly data: Readonly<Record<string, unknown>>;
  readonly requestId: string;
}

export interface JobRow {
  readonly name: JobName;
  readonly data: JobCatalog[JobName];
  readonly options: EnqueueOptions;
}

export const emptyState = (): FakeState => ({
  users: new Map(),
  accessRequests: new Map(),
  signIns: new Map(),
  sessions: new Map(),
  audit: [],
  jobs: [],
  issues: new Map(),
  pointTypes: new Map(),
  points: new Map(),
  mailLedger: new Map(),
  mailGate: { notBefore: null, code: null },
  nextId: 1,
});

/**
 * Deletes a user as `DELETE FROM users` would: requests, sessions, sign-ins
 * and ledger rows cascade; a request they decided (decided_by) or a point
 * they wrote (points_author_id_users_id_fk) refuses it.
 */
export function eraseFakeUser(state: FakeState, id: string): void {
  const requests = [...state.accessRequests.values()];
  if (requests.some((r) => r.decidedBy === id)) throw new DatabaseFailure('23503');
  if ([...state.points.values()].some((p) => p.authorId === id)) {
    throw new DatabaseFailure('23503');
  }
  for (const r of requests) if (r.userId === id) state.accessRequests.delete(r.id);
  for (const [key, s] of state.sessions) if (s.userId === id) state.sessions.delete(key);
  for (const [key, s] of state.signIns) if (s.userId === id) state.signIns.delete(key);
  for (const [key, row] of state.mailLedger)
    if (row.recipientId === id) state.mailLedger.delete(key);
  state.users.delete(id);
}

export function newId(state: FakeState): string {
  return `00000000-0000-7000-8000-${String(state.nextId++).padStart(12, '0')}`;
}

/** One transaction's view: its draft of the state and what it wrote. */
export interface FakeTxState {
  readonly draft: FakeState;
  readonly mode: 'write' | 'read';
  readonly life: { readonly open: boolean };
  /** Rows this transaction wrote in audited tables (ADR 0011). */
  readonly written: AuditTarget[];
  readonly exempted: AuditTarget[];
  /** Deferred constraint checks (triggers that fire at commit); a throw rolls the transaction back. */
  readonly atCommit: (() => void)[];
}

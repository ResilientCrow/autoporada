import type {
  AccessRequestRecord,
  AuditTarget,
  EnqueueOptions,
  JobName,
  PendingSignIn,
  SessionRecord,
  UserRecord,
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
  /** Hands out UUID-shaped ids in order, as uuidv7() would. */
  nextId: number;
}

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
  readonly data: unknown;
  readonly options: EnqueueOptions;
}

export const emptyState = (): FakeState => ({
  users: new Map(),
  accessRequests: new Map(),
  signIns: new Map(),
  sessions: new Map(),
  audit: [],
  jobs: [],
  nextId: 1,
});

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
}

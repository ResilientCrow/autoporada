import {
  type AccessRequestRecord,
  type AuditTarget,
  type DocumentRecord,
  type EnqueueOptions,
  type FutureEventRecord,
  type FutureItemRecord,
  type GateRow,
  type IssueRecord,
  type IssueTexts,
  type JobCatalog,
  type JobName,
  type LedgerRow,
  type PendingSignIn,
  type PointEventRecord,
  type PointRecord,
  type RegistryEntryRecord,
  type RegistryListRecord,
  type StoredPlaceholder,
  type SessionRecord,
  type StoredSetting,
  type UserRecord,
} from '@/application/ports';
import type { Outline } from '@/domain/outline';
import type { IssueSnapshot } from '@/snapshot';

import { refusedBy } from './guards';

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
  /** issue_items, by issue id: the rows of the issue, as the outline they make (empty = none). */
  readonly issueItems: Map<string, Outline>;
  /** issues.present_text, guests_text and annex2, by ISO Monday; absent = all three null. */
  readonly issueTexts: Map<string, IssueTexts>;
  /** settings, by key. */
  readonly settings: Map<string, StoredSetting>;
  /** registry_lists, by id. Migration 0032's seeds are not here: a test makes the lists it needs. */
  readonly registryLists: Map<string, RegistryListRecord>;
  /** registry_entries, by id; removed entries stay (`removedAt`). */
  readonly registryEntries: Map<string, RegistryEntryRecord>;
  /** points, by id; the client ref is kept next to the record. */
  readonly points: Map<string, FakePoint>;
  /** point_events, by id. */
  readonly pointEvents: Map<string, PointEventRecord>;
  /** future_items, by id; the client ref is kept next to the record. */
  readonly futureItems: Map<string, FakeFutureItem>;
  /** future_events, by id. */
  readonly futureEvents: Map<string, FutureEventRecord>;
  /** report_placeholders, by future item id. */
  readonly reportPlaceholders: Map<string, StoredPlaceholder>;
  /** mail_ledger, by dedupe key. */
  readonly mailLedger: Map<string, LedgerRow>;
  /** generated_documents, by id. */
  readonly documents: Map<string, FakeDocument>;
  /** mail_gate's one row, as migration 0009 inserts it. */
  mailGate: GateRow;
  /** Hands out UUID-shaped ids in order, as uuidv7() would. */
  nextId: number;
}

export type FakePoint = PointRecord & { readonly clientRef: string };

export type FakeDocument = DocumentRecord & {
  readonly snapshot: IssueSnapshot;
  readonly docx: Uint8Array;
  readonly pdf: Uint8Array | null;
  readonly pdfAt: Date | null;
  /** pdf_sources: the DOCX staged for the PDF job while the PDF is pending, else null. */
  readonly source: Uint8Array | null;
};

export type FakeFutureItem = FutureItemRecord & { readonly clientRef: string };

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
  issueItems: new Map(),
  issueTexts: new Map(),
  settings: new Map(),
  registryLists: new Map(),
  registryEntries: new Map(),
  points: new Map(),
  pointEvents: new Map(),
  futureItems: new Map(),
  futureEvents: new Map(),
  reportPlaceholders: new Map(),
  mailLedger: new Map(),
  documents: new Map(),
  mailGate: { notBefore: null, code: null },
  nextId: 1,
});

/**
 * Deletes a user as `DELETE FROM users` would: requests, sessions, sign-ins
 * and ledger rows cascade; a request they decided
 * (access_requests_decided_by_users_id_fk), a point event they caused
 * (point_events_actor_id_users_id_fk) or a point they wrote
 * (points_author_id_users_id_fk), a future event they caused
 * (future_events_actor_id_users_id_fk) or a future item they wrote
 * (future_items_author_id_users_id_fk) refuses it. The checks run in this
 * order because PostgreSQL fires the foreign keys by trigger name, which
 * follows the order drizzle/0015 and 0019 add them in: the event's first, so
 * an author who holds both is refused by the event's.
 */
export function eraseFakeUser(state: FakeState, id: string): void {
  const requests = [...state.accessRequests.values()];
  if (requests.some((r) => r.decidedBy === id)) {
    throw refusedBy('access_requests_decided_by_users_id_fk');
  }
  if ([...state.pointEvents.values()].some((e) => e.actorId === id)) {
    throw refusedBy('point_events_actor_id_users_id_fk');
  }
  if ([...state.points.values()].some((p) => p.authorId === id)) {
    throw refusedBy('points_author_id_users_id_fk');
  }
  if ([...state.futureEvents.values()].some((e) => e.actorId === id)) {
    throw refusedBy('future_events_actor_id_users_id_fk');
  }
  if ([...state.futureItems.values()].some((i) => i.authorId === id)) {
    throw refusedBy('future_items_author_id_users_id_fk');
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

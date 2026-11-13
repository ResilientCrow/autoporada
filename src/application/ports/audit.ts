/** A JSON value, as stored in audit_events.data. */
export type Json =
  string | number | boolean | null | readonly Json[] | { readonly [key: string]: Json };

export type AuditTargetType =
  | 'user'
  | 'session'
  | 'access_request'
  | 'issue'
  | 'point'
  | 'future_item'
  | 'registry_list'
  | 'registry_entry'
  | 'document';

export interface AuditTarget {
  readonly type: AuditTargetType;
  readonly id: string;
}

/** Changed fields only: `{ role: { from: 'submitter', to: 'reviewer' } }`. */
export type AuditDiff = Readonly<Record<string, { readonly from: Json; readonly to: Json }>>;

export interface AuditEvent {
  /** `auth.login`, `user.role.change`, `point.transition`, `issue.generate` … */
  readonly action: `${string}.${string}`;
  readonly target: AuditTarget | null;
  readonly diff?: AuditDiff;
  /** Small typed facts, e.g. `{ docxSha256, version }`. Never tokens or text people wrote. */
  readonly meta?: Readonly<Record<string, Json>>;
  /** Other rows the event changed, e.g. the points a generation published. */
  readonly related?: readonly AuditTarget[];
}

/** Writes that are deliberately not audited (plan §4). The list is closed. */
export const AUDIT_EXEMPTIONS = ['author-autosave', 'retention', 'session-touch'] as const;
export type AuditExemption = (typeof AUDIT_EXEMPTIONS)[number];

/** Records audit events in the caller's transaction. */
export interface AuditPort {
  record(event: AuditEvent): Promise<void>;
  /** Marks a write as deliberately unaudited. Does nothing in production; the fake world checks it. */
  exempt(reason: AuditExemption, target: AuditTarget): void;
}

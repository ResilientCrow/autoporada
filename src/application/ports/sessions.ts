import type { SessionTimes } from '@/domain/identity';

import type { UserRecord } from './users';

/** A server-side session (ADR 0002). The cookie's token is never here, only its digest in the store. */
export interface SessionRecord extends SessionTimes {
  readonly id: string;
  readonly userId: string;
  /** When the user last signed in at Entra (step-up freshness). */
  readonly authTime: Date;
  readonly createdAt: Date;
}

export interface NewSession extends SessionTimes {
  /** SHA-256 of the cookie token, 64 lower-case hex characters. */
  readonly tokenSha256: string;
  readonly userId: string;
  readonly authTime: Date;
}

export type SessionSelector =
  { readonly id: string } | { readonly tokenSha256: string } | { readonly userId: string };

export interface SessionRepo {
  /** System only: the session behind a cookie, with its user as stored now. */
  find(
    tokenSha256: string,
  ): Promise<{ readonly session: SessionRecord; readonly user: UserRecord } | null>;
  /** System only. */
  create(session: NewSession): Promise<SessionRecord>;
  /** System only; the caller exempts it from the audit log ('session-touch'). */
  touch(id: string, times: Pick<SessionTimes, 'lastSeenAt' | 'idleExpiresAt'>): Promise<void>;
  /**
   * Deletes sessions; returns their ids. A user may end only their own: by
   * id (others' are not found) or by their own user id (ScopeViolation for
   * another user or a token digest).
   */
  end(selector: SessionSelector): Promise<readonly string[]>;
}

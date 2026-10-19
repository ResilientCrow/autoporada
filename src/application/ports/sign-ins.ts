import type { SignInPurpose } from '@/domain/identity';

/**
 * A sign-in waiting for Entra's answer (auth_transactions). Protocol state:
 * single use, short-lived, never audited.
 */
export interface PendingSignIn {
  readonly purpose: SignInPurpose;
  /** Step-up only: the signed-in user who must prove it is still them. */
  readonly userId: string | null;
  readonly returnTo: string;
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

/** Hashes travel as 64 lower-case hex characters; the browser's cookie is never stored. */
export interface SignInRepo {
  /** The system may save any; a user only their own step-up (ScopeViolation otherwise). */
  save(cookieSha256: string, signIn: Omit<PendingSignIn, 'createdAt'>): Promise<void>;
  /**
   * System only. Takes the row by cookie and state together, deleting it:
   * at most one caller gets it, and a foreign state leaves it in place.
   */
  take(cookieSha256: string, state: string): Promise<PendingSignIn | null>;
  /** System only. Deletes up to `limit` sign-ins that expired by now; returns how many. */
  purgeExpired(limit: number): Promise<number>;
}

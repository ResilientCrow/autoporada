import { and, eq, inArray, lte } from 'drizzle-orm';

import {
  ScopeViolation,
  type PendingSignIn,
  type SignInRepo,
  type TxContext,
} from '@/application/ports';

import { authTransactions } from '../schema';
import type { TxDatabase } from './database';
import { sha256Bytes } from './digest';

const RECORD = {
  purpose: authTransactions.purpose,
  userId: authTransactions.userId,
  returnTo: authTransactions.returnTo,
  state: authTransactions.state,
  nonce: authTransactions.nonce,
  codeVerifier: authTransactions.codeVerifier,
  createdAt: authTransactions.createdAt,
  expiresAt: authTransactions.expiresAt,
};

export function createSignInRepo(db: TxDatabase, ctx: TxContext): SignInRepo {
  const { principal } = ctx;
  const systemOnly = () => {
    if (principal.kind !== 'system') throw new ScopeViolation();
  };
  return {
    async save(cookieSha256, signIn) {
      const own = (userId: string) => signIn.purpose === 'step_up' && signIn.userId === userId;
      if (principal.kind === 'user' && !own(principal.actor.id)) throw new ScopeViolation();
      await db.insert(authTransactions).values({
        cookieHash: sha256Bytes(cookieSha256),
        purpose: signIn.purpose,
        userId: signIn.userId,
        returnTo: signIn.returnTo,
        state: signIn.state,
        nonce: signIn.nonce,
        codeVerifier: signIn.codeVerifier,
        createdAt: ctx.now,
        expiresAt: signIn.expiresAt,
      });
    },
    async take(cookieSha256, state): Promise<PendingSignIn | null> {
      systemOnly();
      const [row] = await db
        .delete(authTransactions)
        .where(
          and(
            eq(authTransactions.cookieHash, sha256Bytes(cookieSha256)),
            eq(authTransactions.state, state),
          ),
        )
        .returning(RECORD);
      return row ?? null;
    },
    async purgeExpired(limit) {
      systemOnly();
      const expired = db
        .select({ id: authTransactions.id })
        .from(authTransactions)
        .where(lte(authTransactions.expiresAt, ctx.now))
        .limit(limit);
      const rows = await db
        .delete(authTransactions)
        .where(inArray(authTransactions.id, expired))
        .returning({ id: authTransactions.id });
      return rows.length;
    },
  };
}

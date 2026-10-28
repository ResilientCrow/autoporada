import { ScopeViolation, type SignInRepo, type TxContext } from '@/application/ports';

import { guard, refusedBy } from './guards';
import type { FakeTxState } from './state';

const SHA256_HEX = /^[0-9a-f]{64}$/;
const hash = (hex: string) => {
  if (!SHA256_HEX.test(hex)) throw new Error('expected a SHA-256 as 64 lower-case hex characters');
  return hex;
};

/** Sign-ins over the fake state: same scope, single use and expiry rules; never audited. */
export function fakeSignInRepo(tx: FakeTxState, ctx: TxContext): SignInRepo {
  const { principal } = ctx;
  const { signIns } = tx.draft;
  const systemOnly = () => {
    if (principal.kind !== 'system') throw new ScopeViolation();
  };
  return {
    async save(cookieSha256, signIn) {
      guard(tx, true);
      const own = (userId: string) => signIn.purpose === 'step_up' && signIn.userId === userId;
      if (principal.kind === 'user' && !own(principal.actor.id)) throw new ScopeViolation();
      const key = hash(cookieSha256);
      if (signIns.has(key)) throw refusedBy('auth_transactions_cookie_hash_key');
      signIns.set(key, { ...signIn, createdAt: ctx.now });
    },
    async take(cookieSha256, state) {
      guard(tx, true);
      systemOnly();
      const key = hash(cookieSha256);
      const found = signIns.get(key);
      if (!found || found.state !== state) return null;
      signIns.delete(key);
      return found;
    },
    async purgeExpired(limit) {
      guard(tx, true);
      systemOnly();
      const expired = [...signIns].filter(([, s]) => s.expiresAt.getTime() <= ctx.now.getTime());
      for (const [key] of expired.slice(0, limit)) signIns.delete(key);
      return Math.min(expired.length, limit);
    },
  };
}

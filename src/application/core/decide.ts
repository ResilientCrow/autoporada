import type { UserPrincipal } from '@/application/ports';
import { can, isFreshAuth, requiresStepUp, type Check } from '@/domain/policy';

/**
 * The access decision for one check. Step-up is asked only after `can()`
 * passed, so it never tells an unauthorized user that signing in again
 * would help.
 */
export function decide(
  check: Check,
  principal: UserPrincipal,
  now: Date,
): 'forbidden' | 'step-up-required' | null {
  if (!can(principal.actor, check)) return 'forbidden';
  if (requiresStepUp(check.action) && !isFreshAuth(principal.authTime, now)) {
    return 'step-up-required';
  }
  return null;
}

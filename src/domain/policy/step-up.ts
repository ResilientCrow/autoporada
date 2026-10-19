import { CLOCK_SKEW_MS } from '@/domain/time';

import type { Action } from './policy';

/** Actions that need a fresh sign-in on top of the session (ADR 0002). */
const STEP_UP: ReadonlySet<Action> = new Set<Action>(['users.manage', 'registry.newSchoolYear']);

export function requiresStepUp(action: Action): boolean {
  return STEP_UP.has(action);
}

/** A step-up sign-in at Entra counts for this long (ADR 0002). */
export const STEP_UP_MAX_AGE_MS = 10 * 60_000;

/** Whether the session's last Entra sign-in is recent enough for a step-up action. */
export function isFreshAuth(authTime: Date, now: Date): boolean {
  const age = now.getTime() - authTime.getTime();
  return age >= -CLOCK_SKEW_MS && age <= STEP_UP_MAX_AGE_MS;
}

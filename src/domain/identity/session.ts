const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** ADR 0002: idle 4 h, absolute 12 h. A session is touched at most every 5 minutes. */
export const SESSION_IDLE_MS = 4 * HOUR;
export const SESSION_ABSOLUTE_MS = 12 * HOUR;
export const SESSION_TOUCH_MS = 5 * MINUTE;
/** How long a started sign-in waits for Entra's answer. */
export const SIGN_IN_TTL_MS = 10 * MINUTE;

/** A sign-in starts a session (login) or proves the user is still there (step-up). */
export type SignInPurpose = 'login' | 'step_up';

export interface SessionTimes {
  readonly lastSeenAt: Date;
  readonly idleExpiresAt: Date;
  readonly absExpiresAt: Date;
}

const after = (now: Date, ms: number) => new Date(now.getTime() + ms);

export function newSessionTimes(now: Date): SessionTimes {
  return {
    lastSeenAt: now,
    idleExpiresAt: after(now, SESSION_IDLE_MS),
    absExpiresAt: after(now, SESSION_ABSOLUTE_MS),
  };
}

/** Whether a session still counts, and whether this request should push its idle limit out. */
export function sessionVerdict(times: SessionTimes, now: Date): 'live' | 'touch' | 'expired' {
  const t = now.getTime();
  if (t >= times.idleExpiresAt.getTime() || t >= times.absExpiresAt.getTime()) return 'expired';
  return t - times.lastSeenAt.getTime() >= SESSION_TOUCH_MS ? 'touch' : 'live';
}

/** The times after a touch: the idle limit moves, never past the absolute one. */
export function touched(
  times: SessionTimes,
  now: Date,
): Pick<SessionTimes, 'lastSeenAt' | 'idleExpiresAt'> {
  const idle = Math.min(now.getTime() + SESSION_IDLE_MS, times.absExpiresAt.getTime());
  return { lastSeenAt: now, idleExpiresAt: new Date(idle) };
}

/**
 * The names and numbers the notice states. The UI may not import server code,
 * so `test/arch/privacy-facts.test.ts` compares each one with the code that
 * enforces it: change the code and that test fails until the notice follows.
 */
export const PRIVACY_FACTS = {
  sessionCookie: '__Host-ap_session',
  signInCookie: '__Host-ap_signin',
  sessionIdleHours: 4,
  sessionMaxHours: 12,
  signInMinutes: 10,
  auditYears: 3,
  logMegabytes: 10,
  logFiles: 5,
} as const;

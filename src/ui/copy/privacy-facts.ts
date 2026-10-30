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
  accessCooldownDays: 30,
  // Job queue retention; test/arch/privacy-facts.test.ts ties these to src/infra/jobs/queues.ts.
  jobsKeptDays: 2,
  unrunJobsKeptDays: 14,
  deadJobsKeptDays: 90,
  // Mail ledger retention; test/arch/privacy-facts.test.ts ties it to src/domain/retention.
  mailLogKeptDays: 91,
  // The school directory search; test/arch/privacy-facts.test.ts ties these to DIRECTORY_LIMITS.
  directoryMinQuery: 3,
  directoryHits: 10,
  logMegabytes: 10,
  logFiles: 5,
} as const;

/**
 * Business rules a user can run into, by code. The Czech wording lives in
 * ui/copy; adding a code without it fails the type check.
 */
export const RULE_CODES = [
  'last-headmaster',
  'student-role',
  'request-pending',
  'request-cooldown',
  'request-blocked',
  'draft-cap',
] as const;
export type RuleCode = (typeof RULE_CODES)[number];

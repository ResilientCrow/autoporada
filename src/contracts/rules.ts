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
  'point-not-editable',
  'future-not-editable',
  'report-not-due',
  'type-name-taken',
  'type-locked',
  'bullet-kind-fixed',
  'registry-duplicate',
  'registry-list-taken',
  'registry-list-fixed',
  'quotes-not-allowed',
  'quotes-full',
  'item-missing',
  'meeting-order',
  'issue-not-open',
  'deadline-past',
] as const;
export type RuleCode = (typeof RULE_CODES)[number];

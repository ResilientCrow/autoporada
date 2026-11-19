/**
 * Who a person is at the school (ADR 0072 item 2). A tier grants no rights:
 * only the role does. Empty until the headmaster sets it.
 */
export type Tier = 'reditel' | 'vedeni' | 'ucitel' | 'zamestnanec' | 'student' | 'absolvent';

export const TIERS: readonly Tier[] = [
  'reditel',
  'vedeni',
  'ucitel',
  'zamestnanec',
  'student',
  'absolvent',
];

/** A student or an absolvent: at most a submitter, and never sees the registry or archive. */
export function isStudentTier(tier: Tier | null): boolean {
  return tier === 'student' || tier === 'absolvent';
}

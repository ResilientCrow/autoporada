import { isStudentTier, type Tier } from '@/domain/actor';
import type { AUDIENCES } from '@/domain/policy';

/**
 * The tier an audience asks for, until the form sends the tier itself (ADR 0072 item 2): a
 * student keeps their student tier (or absolvent) and becomes `student` otherwise; staff keeps a
 * staff tier and has none otherwise. An unchanged audience never changes the tier.
 */
export function tierOfAudience(
  audience: (typeof AUDIENCES)[number],
  tier: Tier | null,
): Tier | null {
  if (audience === 'student') return isStudentTier(tier) ? tier : 'student';
  return isStudentTier(tier) ? null : tier;
}

import type { Actor } from '@/domain/actor';
import { can, type Check } from '@/domain/policy';
import { cs } from '@/ui/copy';

export interface NavItem {
  readonly href: `/${string}`;
  readonly label: string;
  /** Who sees the entry: the policy decides, never a role name here. Null shows it to everyone. */
  readonly check: Check | null;
}

/** Implemented routes only; each entry joins with its page. */
export const NAV: readonly NavItem[] = [
  { href: '/', label: cs.nav.overview, check: null },
  { href: '/body', label: cs.nav.points, check: { action: 'point.create' } },
  { href: '/kontrola', label: cs.nav.review, check: { action: 'review.queue' } },
  { href: '/pristup', label: cs.nav.access, check: { action: 'access.request' } },
  { href: '/uzivatele', label: cs.nav.users, check: { action: 'users.view' } },
];

/** The entries this actor may use. */
export function navFor(actor: Actor, items: readonly NavItem[] = NAV): readonly NavItem[] {
  return items.filter((item) => item.check === null || can(actor, item.check));
}

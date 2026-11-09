import type { Actor } from '@/domain/actor';
import { can, type Check } from '@/domain/policy';
import { cs } from '@/ui/copy';

export interface NavItem {
  readonly href: `/${string}`;
  readonly label: string;
  /** Who sees the entry: the policy decides, never a role name here. Null shows it to everyone. */
  readonly check: Check | null;
  /** Hides the entry from whoever passes this check: the staff see one merged entry instead. */
  readonly unless?: Check;
  /** Other pages (a page's `current`) the entry stands for, so it is marked there too. */
  readonly also?: readonly `/${string}`[];
}

/** The staff (reviewers and the headmaster) see the review entries and „Přidání akcí“. */
const STAFF: Check = { action: 'review.queue' };

/** Implemented routes only; each entry joins with its page. */
export const NAV: readonly NavItem[] = [
  { href: '/klasicke', label: cs.nav.overview, check: null },
  { href: '/body', label: cs.nav.points, check: { action: 'point.create' }, unless: STAFF },
  { href: '/akce', label: cs.nav.future, check: { action: 'future.create' }, unless: STAFF },
  { href: '/kontrola', label: cs.nav.review, check: STAFF },
  { href: '/kontrola/akce', label: cs.nav.reviewFuture, check: STAFF },
  { href: '/pridani', label: cs.nav.add, check: STAFF, also: ['/body', '/akce'] },
  { href: '/registr', label: cs.nav.registry, check: { action: 'registry.view' } },
  { href: '/porada', label: cs.nav.porada, check: { action: 'issue.preview' } },
  { href: '/porada/archiv', label: cs.nav.archive, check: { action: 'archive.view' } },
  { href: '/pristup', label: cs.nav.access, check: { action: 'access.request' } },
  {
    href: '/nastaveni',
    label: cs.nav.settings,
    check: { action: 'settings.manage' },
    also: ['/uzivatele'],
  },
];

/** The entries this actor may use. */
export function navFor(actor: Actor, items: readonly NavItem[] = NAV): readonly NavItem[] {
  return items.filter(
    (item) =>
      (item.check === null || can(actor, item.check)) &&
      (item.unless === undefined || !can(actor, item.unless)),
  );
}

/** The entry marks the page the shell shows: its own or one it stands for. */
export function isCurrent(item: NavItem, current: `/${string}` | undefined): boolean {
  return current !== undefined && (item.href === current || (item.also ?? []).includes(current));
}

import { describe, expect, it } from 'vitest';

import type { Actor, Role, UserStatus } from '@/domain/actor';

import { NAV, navFor, type NavItem } from './nav';

function actor(role: Role, options: { status?: UserStatus; isStudent?: boolean } = {}): Actor {
  return { id: `${role}-1`, role, status: 'active', isStudent: false, ...options };
}

const ITEMS: readonly NavItem[] = [
  { href: '/', label: 'a', check: null },
  { href: '/registr', label: 'b', check: { action: 'registry.view' } },
  { href: '/uzivatele', label: 'c', check: { action: 'users.manage' } },
];

const hrefs = (a: Actor) => navFor(a, ITEMS).map((i) => i.href);

describe('navFor', () => {
  it.each([
    ['headmaster', actor('headmaster'), ['/', '/registr', '/uzivatele']],
    ['reviewer', actor('reviewer'), ['/', '/registr']],
    ['student submitter', actor('submitter', { isStudent: true }), ['/']],
    ['pending user', actor('pending'), ['/']],
    ['blocked user', actor('reviewer', { status: 'blocked' }), ['/']],
  ])('shows a %s only what the policy allows', (_name, who, expected) => {
    expect(hrefs(who)).toEqual(expected);
  });

  it('uses the real routes by default', () => {
    expect(navFor(actor('submitter'))).toEqual(NAV);
  });
});

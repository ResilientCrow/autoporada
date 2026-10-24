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

  it('shows the access request page to a pending user only', () => {
    expect(navFor(actor('pending')).map((i) => i.href)).toEqual(['/', '/pristup']);
    expect(navFor(actor('submitter')).map((i) => i.href)).toEqual(['/']);
    expect(navFor(actor('headmaster')).map((i) => i.href)).not.toContain('/pristup');
  });

  it('shows the users page to a headmaster only', () => {
    expect(navFor(actor('headmaster')).map((i) => i.href)).toEqual(['/', '/uzivatele']);
    expect(navFor(actor('submitter')).map((i) => i.href)).toEqual(['/']);
    expect(navFor(actor('reviewer')).map((i) => i.href)).toEqual(['/']);
    expect(navFor(actor('pending')).map((i) => i.href)).not.toContain('/uzivatele');
  });

  it('uses the real routes by default', () => {
    expect(navFor(actor('pending'))).toEqual(NAV.filter((i) => i.href !== '/uzivatele'));
  });
});

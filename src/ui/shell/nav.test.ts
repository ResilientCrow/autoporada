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
    expect(navFor(actor('pending')).map((i) => i.href)).toEqual(['/', '/pristup', '/profil']);
    expect(navFor(actor('submitter')).map((i) => i.href)).not.toContain('/pristup');
    expect(navFor(actor('headmaster')).map((i) => i.href)).not.toContain('/pristup');
  });

  it('shows the users page to a headmaster only', () => {
    expect(navFor(actor('headmaster')).map((i) => i.href)).toEqual([
      '/',
      '/body',
      '/akce',
      '/porada',
      '/porada/archiv',
      '/kontrola',
      '/registr',
      '/uzivatele',
      '/nastaveni',
      '/profil',
    ]);
    expect(navFor(actor('submitter')).map((i) => i.href)).not.toContain('/uzivatele');
    expect(navFor(actor('reviewer')).map((i) => i.href)).not.toContain('/uzivatele');
    expect(navFor(actor('pending')).map((i) => i.href)).not.toContain('/uzivatele');
  });

  it('shows „Nastavení“ to a headmaster only', () => {
    const entry = (who: Actor) => navFor(who).find((i) => i.href === '/nastaveni');
    expect(entry(actor('headmaster'))?.label).toBe('Nastavení');
    for (const who of [actor('reviewer'), actor('submitter'), actor('pending')]) {
      expect(entry(who)).toBeUndefined();
    }
  });

  it.each([
    ['submitter', actor('submitter')],
    ['student submitter', actor('submitter', { isStudent: true })],
    ['reviewer', actor('reviewer')],
    ['headmaster', actor('headmaster')],
  ])('shows „Moje body“ to a %s', (_name, who) => {
    expect(navFor(who).map((i) => i.href)).toContain('/body');
    expect(navFor(who).find((i) => i.href === '/body')?.label).toBe('Moje body');
  });

  it.each([
    ['a pending user', actor('pending')],
    ['a blocked submitter', actor('submitter', { status: 'blocked' })],
    ['a deactivated reviewer', actor('reviewer', { status: 'deactivated' })],
  ])('hides „Moje body“ from %s', (_name, who) => {
    expect(navFor(who).map((i) => i.href)).not.toContain('/body');
  });

  it.each([
    ['submitter', actor('submitter')],
    ['student submitter', actor('submitter', { isStudent: true })],
    ['reviewer', actor('reviewer')],
    ['headmaster', actor('headmaster')],
  ])('shows „Akce“ to a %s, after „Moje body“', (_name, who) => {
    const hrefs = navFor(who).map((i) => i.href);
    expect(navFor(who).find((i) => i.href === '/akce')?.label).toBe('Akce');
    expect(hrefs.indexOf('/akce')).toBe(hrefs.indexOf('/body') + 1);
  });

  it.each([
    ['a pending user', actor('pending')],
    ['a blocked submitter', actor('submitter', { status: 'blocked' })],
  ])('hides „Akce“ from %s', (_name, who) => {
    expect(navFor(who).map((i) => i.href)).not.toContain('/akce');
  });

  it.each([
    ['reviewer', actor('reviewer')],
    ['headmaster', actor('headmaster')],
  ])('shows „Kontrola“ to a %s', (_name, who) => {
    expect(navFor(who).find((i) => i.href === '/kontrola')?.label).toBe('Kontrola');
  });

  it.each([
    ['a submitter', actor('submitter')],
    ['a student submitter', actor('submitter', { isStudent: true })],
    ['a pending user', actor('pending')],
    ['a blocked reviewer', actor('reviewer', { status: 'blocked' })],
  ])('hides „Kontrola“ from %s', (_name, who) => {
    expect(navFor(who).map((i) => i.href)).not.toContain('/kontrola');
  });

  it.each([
    ['pending user', actor('pending')],
    ['student submitter', actor('submitter', { isStudent: true })],
    ['submitter', actor('submitter')],
    ['reviewer', actor('reviewer')],
    ['headmaster', actor('headmaster')],
  ])('shows „Profil“ to a %s, last', (_name, who) => {
    const items = navFor(who);
    expect(items.at(-1)).toMatchObject({ href: '/profil', label: 'Profil' });
  });

  it.each([
    ['a blocked submitter', actor('submitter', { status: 'blocked' })],
    ['a deactivated reviewer', actor('reviewer', { status: 'deactivated' })],
  ])('hides „Profil“ from %s', (_name, who) => {
    expect(navFor(who).map((i) => i.href)).not.toContain('/profil');
  });

  it('lists „Moje body“ right after the Přehled', () => {
    expect(NAV.slice(0, 2).map((i) => i.href)).toEqual(['/', '/body']);
  });

  it('uses the real routes by default', () => {
    expect(navFor(actor('pending'))).toEqual(
      NAV.filter(
        (i) =>
          ![
            ...['/uzivatele', '/body', '/akce', '/porada', '/porada/archiv', '/kontrola'],
            ...['/registr', '/nastaveni'],
          ].includes(i.href),
      ),
    );
  });
});

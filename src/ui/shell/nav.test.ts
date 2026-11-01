import { describe, expect, it } from 'vitest';

import type { Actor, Role, UserStatus } from '@/domain/actor';

import { isCurrent, NAV, navFor, type NavItem } from './nav';

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

  it('gives a headmaster the staff entries, in order', () => {
    expect(navFor(actor('headmaster')).map((i) => i.label)).toEqual([
      'Přehled',
      'Schválení bodů',
      'Schválení budoucích akcí',
      'Přidání akcí',
      'Seznamy studentů',
      'Porada',
      'Archiv',
      'Nastavení',
      'Profil',
    ]);
  });

  it('gives a reviewer the staff entries the policy allows, without „Nastavení“', () => {
    expect(navFor(actor('reviewer')).map((i) => i.href)).toEqual([
      '/',
      '/kontrola',
      '/kontrola/akce',
      '/pridani',
      '/registr',
      '/porada',
      '/porada/archiv',
      '/profil',
    ]);
  });

  it.each([
    ['submitter', actor('submitter')],
    ['student submitter', actor('submitter', { isStudent: true })],
  ])('gives a %s the current and future events and the profile', (_name, who) => {
    expect(navFor(who).map((i) => i.label)).toEqual([
      'Přehled',
      'Současné události',
      'Budoucí události',
      'Profil',
    ]);
  });

  it('lists no „Uživatelé“ entry: the page is reached from „Nastavení“, which it marks', () => {
    for (const role of ['headmaster', 'reviewer', 'submitter', 'pending'] as const) {
      expect(navFor(actor(role)).map((i) => i.href)).not.toContain('/uzivatele');
    }
    const settings = NAV.find((i) => i.href === '/nastaveni');
    expect(settings && isCurrent(settings, '/uzivatele')).toBe(true);
  });

  it('shows „Nastavení“ to a headmaster only', () => {
    const entry = (who: Actor) => navFor(who).find((i) => i.href === '/nastaveni');
    expect(entry(actor('headmaster'))?.label).toBe('Nastavení');
    for (const who of [actor('reviewer'), actor('submitter'), actor('pending')]) {
      expect(entry(who)).toBeUndefined();
    }
  });

  it('shows the staff „Přidání akcí“ in place of the two event entries, marked on both pages', () => {
    for (const who of [actor('reviewer'), actor('headmaster')]) {
      const hrefs = navFor(who).map((i) => i.href);
      expect(hrefs).toContain('/pridani');
      expect(hrefs).not.toContain('/body');
      expect(hrefs).not.toContain('/akce');
    }
    const add = NAV.find((i) => i.href === '/pridani');
    expect(
      add && ['/pridani', '/body', '/akce'].map((c) => isCurrent(add, c as `/${string}`)),
    ).toEqual([true, true, true]);
    expect(add && isCurrent(add, '/kontrola')).toBe(false);
    expect(add && isCurrent(add, undefined)).toBe(false);
  });

  it('hides „Přidání akcí“ from a submitter', () => {
    expect(navFor(actor('submitter')).map((i) => i.href)).not.toContain('/pridani');
  });

  it.each([
    ['a pending user', actor('pending')],
    ['a blocked submitter', actor('submitter', { status: 'blocked' })],
    ['a deactivated reviewer', actor('reviewer', { status: 'deactivated' })],
  ])('hides „Současné události“ from %s', (_name, who) => {
    expect(navFor(who).map((i) => i.href)).not.toContain('/body');
  });

  it.each([
    ['submitter', actor('submitter')],
    ['student submitter', actor('submitter', { isStudent: true })],
  ])('shows „Budoucí události“ to a %s, after „Současné události“', (_name, who) => {
    const hrefs = navFor(who).map((i) => i.href);
    expect(navFor(who).find((i) => i.href === '/akce')?.label).toBe('Budoucí události');
    expect(hrefs.indexOf('/akce')).toBe(hrefs.indexOf('/body') + 1);
  });

  it.each([
    ['a pending user', actor('pending')],
    ['a blocked submitter', actor('submitter', { status: 'blocked' })],
  ])('hides „Budoucí události“ from %s', (_name, who) => {
    expect(navFor(who).map((i) => i.href)).not.toContain('/akce');
  });

  it.each([
    ['reviewer', actor('reviewer')],
    ['headmaster', actor('headmaster')],
  ])('shows both review entries to a %s', (_name, who) => {
    expect(navFor(who).find((i) => i.href === '/kontrola')?.label).toBe('Schválení bodů');
    expect(navFor(who).find((i) => i.href === '/kontrola/akce')?.label).toBe(
      'Schválení budoucích akcí',
    );
  });

  it.each([
    ['a submitter', actor('submitter')],
    ['a student submitter', actor('submitter', { isStudent: true })],
    ['a pending user', actor('pending')],
    ['a blocked reviewer', actor('reviewer', { status: 'blocked' })],
  ])('hides the review entries from %s', (_name, who) => {
    expect(navFor(who).map((i) => i.href)).not.toContain('/kontrola');
    expect(navFor(who).map((i) => i.href)).not.toContain('/kontrola/akce');
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

  it('lists „Současné události“ right after the Přehled', () => {
    expect(NAV.slice(0, 2).map((i) => i.href)).toEqual(['/', '/body']);
  });

  it('uses the real routes by default', () => {
    expect(navFor(actor('pending'))).toEqual(
      NAV.filter(
        (i) =>
          ![
            ...['/body', '/akce', '/porada', '/porada/archiv', '/kontrola', '/kontrola/akce'],
            ...['/pridani', '/registr', '/nastaveni'],
          ].includes(i.href),
      ),
    );
  });
});

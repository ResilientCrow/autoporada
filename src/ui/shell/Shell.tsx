import Link from 'next/link';
import type { ReactNode } from 'react';

import type { Actor } from '@/domain/actor';
import { cs } from '@/ui/copy';
import { Button, buttonStyles, Icon, TextLink } from '@/ui/kit';

import { isCurrent, navFor } from './nav';
import { NAV_LOOK, NavIcon } from './NavIcon';
import { NavLink } from './NavLink';

/** The gap between the top-level blocks of every page (ADR 0043). */
const STACK = 'flex flex-col gap-8';

/**
 * The frame of every page: skip link first, then the dark brand header, the
 * one `main` (the skip link's target) and the footer. Static, never sticky.
 * Header, `main` and footer share one frame (the same left edge, 72 rem at most);
 * `width` limits only the content column: 48 rem for `text`, the whole frame for `wide`.
 * A signed-in viewer adds the navigation the policy allows, their name and the sign-out
 * button: on the brand row and a row of links from `lg`, below that in a native `<details>`
 * menu (no script; the `key` closes it on each page). `main` spaces the page's blocks 32 px apart.
 */
export function Shell({
  viewer,
  current,
  width = 'text',
  children,
}: {
  readonly viewer?: { readonly displayName: string; readonly actor: Actor };
  readonly current?: `/${string}`;
  readonly width?: 'text' | 'wide';
  readonly children: ReactNode;
}) {
  const items = viewer ? navFor(viewer.actor) : [];
  const links = items.map((item) => (
    <li key={item.href}>
      <NavLink href={item.href} current={isCurrent(item, current)}>
        {item.label}
      </NavLink>
    </li>
  ));
  const signOut = (
    <form method="post" action="/auth/logout">
      <Button variant="secondary" type="submit" name="scope" value="this">
        {cs.shell.signOut}
      </Button>
    </form>
  );
  /** The phone's bottom bar: home and the next three entries; the rest stay in the menu. */
  const PREFER = [
    '/klasicke',
    '/porada',
    '/kontrola',
    '/porada/archiv',
    '/body',
    '/akce',
    '/registr',
  ];
  const bar = PREFER.flatMap((h) => items.filter((i) => i.href === h)).slice(0, 4);
  return (
    <div className="flex min-h-screen flex-col bg-light">
      <a
        href="#obsah"
        className="sr-only rounded-brand focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-10 focus:bg-light focus:p-2 focus:font-bold"
      >
        {cs.shell.skipLink}
      </a>
      <header className="relative border-b border-sublight bg-light">
        <div className="frame flex min-h-16 items-center justify-between gap-4 py-3">
          <Link href="/klasicke" prefetch={false} className="block no-underline">
            {/* eslint-disable-next-line @next/next/no-img-element -- a static local SVG */}
            <img src="/arch/logo.svg" alt={cs.shell.logoAlt} className="block h-10 w-auto" />
          </Link>
          {viewer && (
            <>
              <div className="hidden items-center gap-4 lg:flex">
                <p className="text-mut">{viewer.displayName}</p>
                {signOut}
              </div>
              <details key={current} className="lg:hidden">
                <summary className={`${buttonStyles('secondary')} summary-plain gap-2`}>
                  <Icon name="menu" />
                  {cs.shell.menu}
                </summary>
                <div className="absolute inset-x-0 top-full z-20 border-b border-sublight bg-light shadow-menu">
                  <div className="frame flex flex-col gap-4 py-4">
                    <nav aria-label={cs.nav.label}>
                      <ul className="flex flex-col gap-1">{links}</ul>
                    </nav>
                    <p className="text-sm text-mut">{viewer.displayName}</p>
                    {signOut}
                  </div>
                </div>
              </details>
            </>
          )}
        </div>
        {viewer && (
          <div className="hidden lg:block">
            <nav aria-label={cs.nav.label} className="frame pb-3">
              <ul className="flex flex-wrap gap-1">{links}</ul>
            </nav>
          </div>
        )}
      </header>
      <main
        id="obsah"
        tabIndex={-1}
        className={`frame flex-1 py-8 sm:py-10 ${viewer ? 'pb-28 lg:pb-10' : ''}`}
      >
        <div className={width === 'wide' ? STACK : `${STACK} max-w-3xl`}>{children}</div>
      </main>
      <footer className="surface-dark">
        <div
          className={`frame flex flex-wrap items-center gap-x-6 gap-y-2 py-6 text-sm ${viewer ? 'pb-24 lg:pb-6' : ''}`}
        >
          <p>{cs.shell.school}</p>
          <TextLink href="/ochrana-osobnich-udaju">{cs.shell.privacy}</TextLink>
        </div>
      </footer>
      {viewer && bar.length > 1 && (
        <nav
          aria-label={cs.shell.bottomBar}
          className="fixed inset-x-0 bottom-0 z-30 border-t border-sublight bg-light pb-safe lg:hidden"
        >
          <ul className="flex">
            {bar.map((item) => (
              <BarItem
                key={item.href}
                href={item.href}
                label={item.label}
                on={isCurrent(item, current)}
              />
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}

/** One link of the bottom bar below `lg`: icon over its short name. */
function BarItem({
  href,
  label,
  on,
}: {
  readonly href: string;
  readonly label: string;
  readonly on: boolean;
}) {
  const look = NAV_LOOK[href];
  const tone = on ? 'font-bold text-ink' : 'text-mut';
  return (
    <li className="flex-1">
      <Link
        href={href}
        prefetch={false}
        aria-current={on ? 'page' : undefined}
        className={`flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-xs no-underline ${tone}`}
      >
        <NavIcon name={look?.icon ?? 'doc'} />
        <span>{look?.short ?? label}</span>
      </Link>
    </li>
  );
}

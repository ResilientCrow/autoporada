import Link from 'next/link';
import type { ReactNode } from 'react';

import type { Actor } from '@/domain/actor';
import { cs } from '@/ui/copy';
import { Button, buttonStyles, Icon, TextLink } from '@/ui/kit';

import { isCurrent, navFor } from './nav';
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
      <Button variant="onDark" type="submit" name="scope" value="this">
        {cs.shell.signOut}
      </Button>
    </form>
  );
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#obsah"
        className="sr-only rounded-brand focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-10 focus:bg-light focus:p-2 focus:font-bold"
      >
        {cs.shell.skipLink}
      </a>
      <header className="surface-dark relative">
        <div className="frame flex min-h-14 items-center justify-between gap-4 py-2">
          <Link
            href="/"
            prefetch={false}
            className="font-slab text-xl font-bold uppercase no-underline"
          >
            {cs.shell.brand}
          </Link>
          {viewer && (
            <>
              <div className="hidden items-center gap-4 lg:flex">
                <p>{viewer.displayName}</p>
                {signOut}
              </div>
              <details key={current} className="lg:hidden">
                <summary className={`${buttonStyles('onDark')} summary-plain gap-2`}>
                  <Icon name="menu" />
                  {cs.shell.menu}
                </summary>
                <div className="surface-dark absolute inset-x-0 top-full z-20 border-t border-navy-mid">
                  <div className="frame flex flex-col gap-4 py-4">
                    <nav aria-label={cs.nav.label}>
                      <ul className="flex flex-col">{links}</ul>
                    </nav>
                    <p className="text-sm">{viewer.displayName}</p>
                    {signOut}
                  </div>
                </div>
              </details>
            </>
          )}
        </div>
        {viewer && (
          <div className="hidden border-t border-navy-mid lg:block">
            <nav aria-label={cs.nav.label} className="frame">
              <ul className="flex flex-wrap gap-x-6">{links}</ul>
            </nav>
          </div>
        )}
      </header>
      <main id="obsah" tabIndex={-1} className="frame flex-1 py-6 sm:py-8">
        <div className={width === 'wide' ? STACK : `${STACK} max-w-3xl`}>{children}</div>
      </main>
      <footer className="surface-dark">
        <div className="frame flex flex-wrap items-center gap-x-6 gap-y-2 py-6 text-sm">
          <p>{cs.shell.school}</p>
          <TextLink href="/ochrana-osobnich-udaju">{cs.shell.privacy}</TextLink>
        </div>
      </footer>
    </div>
  );
}

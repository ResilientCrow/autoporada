import Link from 'next/link';
import type { ReactNode } from 'react';

import type { Actor } from '@/domain/actor';
import { cs } from '@/ui/copy';
import { Button } from '@/ui/kit';

import { navFor } from './nav';
import { NavLink } from './NavLink';

/**
 * The frame of every page: skip link first, then the dark brand header, the
 * one `main` (the skip link's target) and the footer. Static, never sticky,
 * and the header wraps on narrow screens. A signed-in viewer adds the
 * navigation the policy allows, their name and the sign-out button.
 */
export function Shell({
  viewer,
  current,
  children,
}: {
  readonly viewer?: { readonly displayName: string; readonly actor: Actor };
  readonly current?: `/${string}`;
  readonly children: ReactNode;
}) {
  const items = viewer ? navFor(viewer.actor) : [];
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#obsah"
        className="sr-only rounded-brand focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-10 focus:bg-light focus:p-2 focus:font-bold"
      >
        {cs.shell.skipLink}
      </a>
      <header className="surface-dark">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 p-4">
          <Link
            href="/"
            prefetch={false}
            className="font-slab text-xl font-bold uppercase no-underline"
          >
            {cs.shell.brand}
          </Link>
          {viewer && (
            <>
              <nav aria-label={cs.nav.label}>
                <ul className="flex flex-wrap gap-x-4 gap-y-1">
                  {items.map((item) => (
                    <li key={item.href}>
                      <NavLink href={item.href} current={item.href === current}>
                        {item.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </nav>
              <p className="ml-auto">{viewer.displayName}</p>
              <form method="post" action="/auth/logout">
                <Button variant="onDark" type="submit" name="scope" value="this">
                  {cs.shell.signOut}
                </Button>
              </form>
            </>
          )}
        </div>
      </header>
      <main id="obsah" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 p-4">
        {children}
      </main>
      <footer className="surface-dark">
        <p className="mx-auto max-w-3xl p-4">{cs.shell.school}</p>
      </footer>
    </div>
  );
}

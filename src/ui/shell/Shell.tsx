import Link from 'next/link';
import type { ReactNode } from 'react';

import { cs } from '@/ui/copy';

/**
 * The frame of every page: skip link first, then the dark brand header, the
 * one `main` (the skip link's target) and the footer. Static, never sticky,
 * and the header wraps on narrow screens.
 */
export function Shell({ children }: { readonly children: ReactNode }) {
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

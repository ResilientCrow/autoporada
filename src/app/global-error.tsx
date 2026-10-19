'use client';

import { cs } from '@/ui/copy';

/**
 * The last resort when rendering fails, in place of Next's built-in page,
 * whose inline styles the CSP refuses. It replaces the root layout.
 */
export default function GlobalError({ reset }: { readonly reset: () => void }) {
  return (
    <html lang="cs">
      <body>
        <main>
          <h1>{cs.appError.title}</h1>
          <p>{cs.appError.text}</p>
          <button type="button" onClick={reset}>
            {cs.appError.retry}
          </button>
        </main>
      </body>
    </html>
  );
}

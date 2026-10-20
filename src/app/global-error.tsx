'use client';

import { cs } from '@/ui/copy';
import '@/ui/theme';

/**
 * The last resort when rendering fails, in place of Next's built-in page,
 * whose inline styles the CSP refuses. It replaces the root layout, and
 * retry() asks the server again (reset() would re-render the same error).
 * Next's static 500 page, used only when a page module itself fails to
 * load, is still its own and renders unstyled under the CSP.
 */
export default function GlobalError({ retry }: { readonly retry: () => void }) {
  return (
    <html lang="cs">
      <body>
        <title>{cs.appError.title}</title>
        <main>
          <h1>{cs.appError.title}</h1>
          <p>{cs.appError.text}</p>
          <button type="button" onClick={() => retry()}>
            {cs.appError.retry}
          </button>
        </main>
      </body>
    </html>
  );
}

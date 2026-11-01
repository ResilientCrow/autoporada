'use client';

import { causeOfError } from '@/contracts';
import { appError, failures, pageTitle } from '@/ui/copy';
import { buttonStyles, SlantLabel } from '@/ui/kit';
import '@/ui/theme';

/**
 * The last resort when rendering fails, in place of Next's built-in page,
 * whose inline styles the CSP refuses. It replaces the root layout, and
 * retry() asks the server again (reset() would re-render the same error).
 * Next's static 500 page, used only when a page module itself fails to
 * load, is still its own and renders unstyled under the CSP.
 *
 * No shell (if it threw, it would throw again) and no React Aria: this page
 * has no csp-nonce meta for React Aria's runtime <style> (ADR 0012).
 *
 * It names the cause the same way `error.tsx` does (ADR 0044), from the digest of
 * the error. A failure of the root layout carries Next's own digest, so it is
 * mostly a bug; one of ours says what broke.
 */
export default function GlobalError({
  error,
  retry,
}: {
  readonly error: unknown;
  readonly retry: () => void;
}) {
  const cause = causeOfError(error);
  // As in the root layout: extensions write onto <html> and <body> before hydration.
  return (
    <html lang="cs" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <title>{pageTitle(appError.title)}</title>
        <main id="obsah" className="frame flex flex-col items-start gap-8 py-8">
          <SlantLabel level={1}>{appError.title}</SlantLabel>
          <p>{failures[cause]}</p>
          <button type="button" className={buttonStyles('primary')} onClick={() => retry()}>
            {appError.retry}
          </button>
        </main>
      </body>
    </html>
  );
}

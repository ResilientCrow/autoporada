'use client';

import { causeOfError } from '@/contracts';
import { appError, failures, pageTitle } from '@/ui/copy';

/** A client file cannot import the server's versioned address; the unversioned one serves the same file. */
const ARCH_STYLESHEET = '/arch/app.css';

/**
 * The last resort when rendering fails, in place of Next's built-in page,
 * whose inline styles the CSP refuses. It replaces the root layout, and
 * retry() asks the server again (reset() would re-render the same error).
 * Next's static 500 page, used only when a page module itself fails to
 * load, is still its own and renders unstyled under the CSP.
 *
 * It takes Arch's stylesheet and the classes of Arch's own error screen, and nothing else
 * (if it threw, it would throw again).
 *
 * It names the cause from the digest of the error (ADR 0044). A failure of the root layout
 * carries Next's own digest, so it is mostly a bug; one of ours says what broke.
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
        <link rel="stylesheet" href={ARCH_STYLESHEET} precedence="default" />
        <div className="lay full">
          <div className="desk scroll err-w">
            <main id="obsah" className="arch err">
              <h1 className="big m">{appError.title}</h1>
              <p className="lead">{failures[cause]}</p>
              <div>
                <button type="button" className="btn dk lg" onClick={() => retry()}>
                  {appError.retry}
                </button>
              </div>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}

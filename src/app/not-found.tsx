import type { Metadata } from 'next';

import { ARCH_STYLESHEET } from '@/server/routes';
import { cs, pageTitle } from '@/ui/copy';

export const metadata: Metadata = { title: pageTitle(cs.notFound.title) };

/**
 * Unknown addresses, in the Arch UI's look (its own `NotFound` screen, with a link to `/`).
 * Next's built-in page uses inline styles, which the CSP refuses; this one takes Arch's
 * stylesheet, which is the only style there is.
 */
export default function NotFound() {
  return (
    <>
      <link rel="stylesheet" href={ARCH_STYLESHEET} precedence="default" />
      <div className="lay full">
        <div className="desk scroll err-w">
          <main id="obsah" className="arch err">
            <h1 className="big m">{cs.notFound.title}</h1>
            <p className="lead">{cs.notFound.text}</p>
            <div>
              {/* A full load: `/` is the Arch client, not a page of this Next app. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a className="btn dk lg" href="/">
                {cs.notFound.home}
              </a>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}

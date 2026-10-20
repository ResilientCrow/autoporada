import Link from 'next/link';

import { cs } from '@/ui/copy';

/** The pattern gallery: each UI part, once, for the look and accessibility checks. */
export function Gallery() {
  return (
    <main id="obsah" tabIndex={-1}>
      <h1>{cs.gallery.title}</h1>
      <p>{cs.gallery.intro}</p>
      <p>
        <Link href="/vzornik?stav=vyjimka" prefetch={false}>
          {cs.gallery.errorPage}
        </Link>
      </p>
    </main>
  );
}

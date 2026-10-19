import Link from 'next/link';

import { cs } from '@/ui/copy';

/** Unknown pages; Next's built-in one uses inline styles, which the CSP refuses. */
export default function NotFound() {
  return (
    <main>
      <h1>{cs.notFound.title}</h1>
      <p>{cs.notFound.text}</p>
      <p>
        <Link href="/">{cs.notFound.home}</Link>
      </p>
    </main>
  );
}

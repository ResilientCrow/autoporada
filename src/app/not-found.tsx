import type { Metadata } from 'next';

import { cs, pageTitle } from '@/ui/copy';
import { ArrowLink, Card, SlantLabel } from '@/ui/kit';
import { Shell } from '@/ui/shell';

export const metadata: Metadata = { title: pageTitle(cs.notFound.title) };

/** Unknown pages; Next's built-in one uses inline styles, which the CSP refuses. */
export default function NotFound() {
  return (
    <Shell>
      <SlantLabel level={1}>{cs.notFound.title}</SlantLabel>
      <Card>
        <p>{cs.notFound.text}</p>
        <p>
          <ArrowLink href="/">{cs.notFound.home}</ArrowLink>
        </p>
      </Card>
    </Shell>
  );
}

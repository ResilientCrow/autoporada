import { cs } from '@/ui/copy';
import { ArrowLink, Card, SlantLabel } from '@/ui/kit';

/** Unknown pages; Next's built-in one uses inline styles, which the CSP refuses. */
export default function NotFound() {
  return (
    <main id="obsah" tabIndex={-1}>
      <SlantLabel level={1}>{cs.notFound.title}</SlantLabel>
      <Card>
        <p>{cs.notFound.text}</p>
        <p>
          <ArrowLink href="/">{cs.notFound.home}</ArrowLink>
        </p>
      </Card>
    </main>
  );
}

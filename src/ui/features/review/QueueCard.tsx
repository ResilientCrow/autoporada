import { review } from '@/ui/copy';
import { ArrowLink, Card } from '@/ui/kit';

/** „Kontrola“ on the Přehled, for reviewers: how many points wait for a decision, and the way there. */
export function QueueCard({ count }: { readonly count: number }) {
  return (
    <Card title={review.card.title}>
      <p>
        <ArrowLink href="/kontrola">{review.card.waiting(count)}</ArrowLink>
      </p>
    </Card>
  );
}

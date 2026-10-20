import { cs } from '@/ui/copy';
import { Button, Card, Notice, SlantLabel, StatusChip } from '@/ui/kit';

/** The home page: what state the account is in, and signing out of every device. */
export function Overview({ pending }: { readonly pending: boolean }) {
  return (
    <>
      <SlantLabel level={1}>{cs.home.title}</SlantLabel>
      {pending && <Notice tone="info">{cs.home.pending}</Notice>}
      <Card title={cs.home.account}>
        <p>
          <StatusChip tone={pending ? 'waiting' : 'done'}>
            {pending ? cs.home.statusPending : cs.home.statusActive}
          </StatusChip>
        </p>
        <form method="post" action="/auth/logout">
          <Button variant="secondary" type="submit" name="scope" value="all">
            {cs.home.signOutEverywhere}
          </Button>
        </form>
      </Card>
    </>
  );
}

import type { Actor } from '@/domain/actor';
import { cs } from '@/ui/copy';
import { Chip, ACCOUNT_LOOK, ROLE_LOOK, STUDENT_LOOK } from '@/ui/status';
import { Button, Card, Notice, SlantLabel, StatusChip } from '@/ui/kit';

/** The chips of an approved member: role, student, account status. */
function MemberChips({ actor }: { readonly actor: Actor }) {
  return (
    <>
      <Chip look={ROLE_LOOK[actor.role]} />
      {actor.isStudent && <Chip look={STUDENT_LOOK} />}
      <Chip look={ACCOUNT_LOOK[actor.status]} />
    </>
  );
}

/** The home page: what state the account is in, and signing out of every device. */
export function Overview({ actor }: { readonly actor: Actor }) {
  const pending = actor.role === 'pending';
  return (
    <>
      <SlantLabel level={1}>{cs.home.title}</SlantLabel>
      {pending && <Notice tone="info">{cs.home.pending}</Notice>}
      <Card title={cs.home.account}>
        <p className="flex flex-wrap gap-2">
          {pending ? (
            <StatusChip tone="waiting">{cs.home.statusPending}</StatusChip>
          ) : (
            <MemberChips actor={actor} />
          )}
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

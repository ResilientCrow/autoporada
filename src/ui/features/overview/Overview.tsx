import type { z } from 'zod';

import type { myAccessOutput } from '@/contracts';
import type { Actor } from '@/domain/actor';
import { cs } from '@/ui/copy';
import { ArrowLink, Button, Card, Notice, SlantLabel } from '@/ui/kit';
import { ACCOUNT_LOOK, Chip, ROLE_LOOK, STANDING_LOOK, STUDENT_LOOK } from '@/ui/status';

/** What the page knows besides the actor: a waiting user's standing on asking for access. */
type HomeView =
  | { readonly kind: 'member' }
  | {
      readonly kind: 'pending';
      readonly standing: Exclude<z.output<typeof myAccessOutput>['standing']['kind'], 'member'>;
    };

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

/**
 * The top of the home page: its title and, for a user still waiting for access, the notice and the
 * access card. The account card is `AccountCard`, which the page puts last (ADR 0052).
 */
export function Overview({ home }: { readonly home: HomeView }) {
  return (
    <>
      <SlantLabel level={1}>{cs.home.title}</SlantLabel>
      {home.kind === 'pending' && (
        <>
          <Notice tone="info" live={false}>
            {cs.home.pending}
          </Notice>
          <Card title={cs.home.access}>
            {home.standing !== 'open' && (
              <p>
                <Chip look={STANDING_LOOK[home.standing]} />
              </p>
            )}
            <p>
              <ArrowLink href="/pristup">
                {home.standing === 'open' ? cs.home.request : cs.home.showRequest}
              </ArrowLink>
            </p>
          </Card>
        </>
      )}
    </>
  );
}

/** What state the account is in (a member's chips), and signing out of every device. */
export function AccountCard({ actor, home }: { readonly actor: Actor; readonly home: HomeView }) {
  return (
    <Card title={cs.home.account}>
      {home.kind === 'member' && (
        <p className="flex flex-wrap gap-2">
          <MemberChips actor={actor} />
        </p>
      )}
      <form method="post" action="/auth/logout">
        <Button variant="secondary" type="submit" name="scope" value="all">
          {cs.home.signOutEverywhere}
        </Button>
      </form>
    </Card>
  );
}

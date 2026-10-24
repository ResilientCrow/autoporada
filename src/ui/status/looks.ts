import type { Role, UserStatus } from '@/domain/actor';
import type { AccessState, RequestStanding } from '@/domain/review';
import { status } from '@/ui/copy';
import type { StatusTone } from '@/ui/kit';

export interface Look {
  readonly tone: StatusTone;
  readonly label: string;
}

export const ACCESS_LOOK: Readonly<Record<AccessState, Look>> = {
  pending: { tone: 'waiting', label: status.access.pending },
  approved: { tone: 'done', label: status.access.approved },
  rejected: { tone: 'stopped', label: status.access.rejected },
  blocked: { tone: 'stopped', label: status.access.blocked },
  cancelled: { tone: 'neutral', label: status.access.cancelled },
};

export const ROLE_LOOK: Readonly<Record<Role, Look>> = {
  pending: { tone: 'neutral', label: status.role.pending },
  submitter: { tone: 'neutral', label: status.role.submitter },
  reviewer: { tone: 'neutral', label: status.role.reviewer },
  headmaster: { tone: 'neutral', label: status.role.headmaster },
};

export const ACCOUNT_LOOK: Readonly<Record<UserStatus, Look>> = {
  active: { tone: 'done', label: status.account.active },
  blocked: { tone: 'stopped', label: status.account.blocked },
  deactivated: { tone: 'neutral', label: status.account.deactivated },
};

export const STUDENT_LOOK: Look = { tone: 'neutral', label: status.student };

/** Where a person stands on asking for access; `open` (free to ask) has no chip. */
export const STANDING_LOOK: Readonly<Record<Exclude<RequestStanding['kind'], 'open'>, Look>> = {
  pending: ACCESS_LOOK.pending,
  cooldown: ACCESS_LOOK.rejected,
  blocked: ACCESS_LOOK.blocked,
};

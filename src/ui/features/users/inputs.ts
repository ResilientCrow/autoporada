import type { z } from 'zod';

import type { changeUserAccessInput, decideAccessInput } from '@/contracts';
import type { Role, UserStatus } from '@/domain/actor';
import { choiceOf, flagOf } from '@/ui/form';

/**
 * What „Zablokovat další žádosti“ sends. `confirmed` is there only when the box
 * is ticked, so the server, not the form, refuses an unticked one.
 */
export function blockInput(
  requestId: string,
  version: number,
  data: FormData,
): z.input<typeof decideAccessInput> {
  return {
    requestId,
    version,
    decision: 'block',
    ...(flagOf(data, 'confirmed') && { confirmed: true as const }),
  };
}

const ROLE_VALUES = ['pending', 'submitter', 'reviewer', 'headmaster'] as const;
const AUDIENCE_VALUES = ['staff', 'student'] as const;

/**
 * What „Uložit změny“ sends: the full desired state. The status is the user's
 * current one (the account section changes it), and `confirmed` is there only
 * when the box is ticked, so the server decides whether it was needed.
 */
export function roleInput(
  user: { readonly id: string; readonly version: number; readonly status: UserStatus },
  data: FormData,
): z.input<typeof changeUserAccessInput> {
  return {
    userId: user.id,
    version: user.version,
    role: choiceOf(data, 'role', ROLE_VALUES),
    audience: choiceOf(data, 'audience', AUDIENCE_VALUES),
    status: user.status,
    ...(flagOf(data, 'confirmed') && { confirmed: true as const }),
  };
}

/**
 * What the account buttons send: the full state with the user's current role and
 * audience and the new status. `confirmed` is there only when the box is ticked.
 */
export function accountInput(
  user: {
    readonly id: string;
    readonly version: number;
    readonly role: Role;
    readonly isStudent: boolean;
  },
  status: UserStatus,
  data: FormData,
): z.input<typeof changeUserAccessInput> {
  return {
    userId: user.id,
    version: user.version,
    role: user.role,
    audience: user.isStudent ? 'student' : 'staff',
    status,
    ...(flagOf(data, 'confirmed') && { confirmed: true as const }),
  };
}

import type { UserPrincipal } from '@/application/ports';
import { myAccess } from '@/application/use-cases';
import type { z } from 'zod';
import type { myAccessOutput } from '@/contracts';

import { getContainer } from '../container';
import { runRegistered } from '../pipeline';

import { orNotFound } from './not-found';
import { requestId } from './viewer';

export type MyStanding = z.output<typeof myAccessOutput>['standing'];

/** Where the viewer stands on asking for access, or null where the page answers 404 (a refusal). */
export async function myStanding(viewer: UserPrincipal): Promise<MyStanding | null> {
  const result = await runRegistered(getContainer(), myAccess, {
    principal: viewer,
    requestId: await requestId(),
    input: {},
  });
  return orNotFound('access.mine', result)?.standing ?? null;
}

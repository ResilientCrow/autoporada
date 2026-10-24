import { getUser } from '@/application/use-cases';
import type { z } from 'zod';
import type { getUserOutput } from '@/contracts';

import { getContainer } from '../container';
import { runRegistered } from '../pipeline';

import { day } from './dates';
import { orNotFound } from './not-found';
import { getViewer, requestId } from './viewer';

type Loaded = z.output<typeof getUserOutput>;

export interface UserPageModel {
  readonly user: Omit<Loaded['user'], 'createdAt'> & { readonly since: string };
  readonly isSelf: boolean;
  readonly choices: Loaded['choices'];
  /** The newest access request, its dates written out. */
  readonly request:
    | (Omit<NonNullable<Loaded['request']>, 'createdAt' | 'decidedAt'> & {
        readonly submitted: string;
        readonly decided: string | null;
      })
    | null;
  readonly requestEvents: Loaded['requestEvents'];
}

/** One user's page, or null for a visitor or a refusal, a malformed id and an unknown user included (404). */
export async function userPage(id: string): Promise<UserPageModel | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  const loaded = orNotFound(
    'users.get',
    await runRegistered(getContainer(), getUser, {
      principal: viewer,
      requestId: await requestId(),
      input: { userId: id },
    }),
  );
  if (loaded === null) return null;
  const { user, request, ...rest } = loaded;
  const { createdAt, ...facts } = user;
  return {
    ...rest,
    user: { ...facts, since: day(createdAt) },
    request:
      request === null
        ? null
        : {
            requestId: request.requestId,
            version: request.version,
            state: request.state,
            reason: request.reason,
            submitted: day(request.createdAt),
            decided: request.decidedAt === null ? null : day(request.decidedAt),
          },
  };
}

import type { z } from 'zod';

import { listPointTypes } from '@/application/use-cases';
import type { listPointTypesOutput } from '@/contracts';

import { getContainer } from '../container';
import { runRegistered } from '../pipeline';

import { orNotFound } from './not-found';
import { getViewer, requestId } from './viewer';

/** What /body/novy offers: the types a new point can start on. */
export interface NewPointPageModel {
  readonly types: z.output<typeof listPointTypesOutput>['types'];
}

/** The types to choose from, or null for a visitor or a viewer who may not start a point (404). */
export async function newPointPage(): Promise<NewPointPageModel | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  const listed = orNotFound(
    'pointTypes.list',
    await runRegistered(getContainer(), listPointTypes, {
      principal: viewer,
      requestId: await requestId(),
      input: {},
    }),
  );
  return listed && { types: listed.types };
}

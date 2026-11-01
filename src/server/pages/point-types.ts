import type { z } from 'zod';

import { listPointTypes } from '@/application/use-cases';
import type { listPointTypesOutput } from '@/contracts';

import { runPage } from './run-page';

import { orNotFound } from './not-found';
import { getViewer, requestId } from './viewer';

type ListedType = z.output<typeof listPointTypesOutput>['types'][number];

/** One type as the admin form starts from it: its row and the settings it edits. */
type AdminPointType = Omit<ListedType, 'detail'> & NonNullable<ListedType['detail']>;

/** /nastaveni/typy-bodu: every type, retired ones too, in the order the chooser offers them. */
export interface PointTypesPageModel {
  readonly types: readonly AdminPointType[];
}

/** The type admin's page, or null for a visitor or anyone but the headmaster (404). */
export async function pointTypesPage(): Promise<PointTypesPageModel | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  const listed = orNotFound(
    'pointTypes.list',
    await runPage(listPointTypes, {
      principal: viewer,
      requestId: await requestId(),
      input: { includeInactive: true },
    }),
  );
  if (listed === null) return null;
  return {
    types: listed.types.flatMap(({ id, name, detail }) =>
      detail ? [{ id, name, ...detail }] : [],
    ),
  };
}

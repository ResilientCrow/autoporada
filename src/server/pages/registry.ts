import type { z } from 'zod';

import { readRegistry } from '@/application/use-cases';
import type { readRegistryOutput } from '@/contracts';
import { can } from '@/domain/policy';
import { archiveYears, type ArchiveYears } from '@/domain/registry';
import { instantToWallClock } from '@/domain/time';

import { getContainer } from '../container';
import { runPage } from './run-page';

import { orNotFound } from './not-found';
import { getViewer, requestId } from './viewer';

/** /registr and /registr/[klic]: the lists with their counts and, for a key, that list's entries. */
export interface RegistryPageModel extends z.output<typeof readRegistryOutput> {
  /** The headmaster edits; a staff reviewer only reads. */
  readonly canEdit: boolean;
}

/** The registry as the viewer may see it, or null (404) for a visitor, a student or an unknown key. */
export async function registryPage(key?: string): Promise<RegistryPageModel | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  const read = orNotFound(
    'registry.read',
    await runPage(readRegistry, {
      principal: viewer,
      requestId: await requestId(),
      input: key === undefined ? {} : { key },
    }),
  );
  if (read === null) return null;
  return { ...read, canEdit: can(viewer.actor, { action: 'registry.edit' }) };
}

/** /registr/novy-skolni-rok: every list with its active students, and the years it may archive under. */
export interface NewYearPageModel {
  readonly lists: RegistryPageModel['lists'];
  readonly years: ArchiveYears;
}

/** The page of „Nový školní rok“, or null (404) for anyone but the headmaster. */
export async function newYearPage(): Promise<NewYearPageModel | null> {
  const model = await registryPage();
  if (model === null || !model.canEdit) return null;
  const today = instantToWallClock(getContainer().app.clock.now()).date;
  return { lists: model.lists, years: archiveYears(today) };
}

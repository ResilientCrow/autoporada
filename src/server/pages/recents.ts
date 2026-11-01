import type { UserPrincipal } from '@/application/ports';
import { recentPeopleOf } from '@/application/use-cases';
import type { RecentPerson } from '@/domain/people';

import { runPage } from './run-page';

import { requestId } from './viewer';

/**
 * The people the viewer named lately, for an editor's picker. The memory is a convenience: any
 * refusal or failure opens the editor with none.
 */
export async function recentsOf(viewer: UserPrincipal): Promise<readonly RecentPerson[]> {
  const found = await runPage(recentPeopleOf, {
    principal: viewer,
    requestId: await requestId(),
    input: {},
  });
  return found.ok ? found.value.people : [];
}

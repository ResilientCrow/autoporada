import { myAccess } from '@/application/use-cases';
import { formatLongDate } from '@/domain/cs';
import { instantToWallClock } from '@/domain/time';

import { getContainer } from '../container';
import { runRegistered } from '../pipeline';

import { getViewer, requestId } from './viewer';

/** What „Žádost o přístup“ shows, its dates already written out. */
type AccessPageModel =
  | { readonly kind: 'member' }
  | { readonly kind: 'open'; readonly previous: 'rejected' | 'cancelled' | null }
  | { readonly kind: 'pending'; readonly sent: string; readonly reason: string }
  | { readonly kind: 'cooldown'; readonly decided: string; readonly from: string }
  | { readonly kind: 'blocked' };

/** The Prague calendar day of an instant, as „12. října 2026“. */
const day = (iso: string) => formatLongDate(instantToWallClock(new Date(iso)).date);

/** The access page's model, or null for a visitor or a refusal (the page answers 404). */
export async function accessPage(): Promise<AccessPageModel | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  const result = await runRegistered(getContainer(), myAccess, {
    principal: viewer,
    requestId: await requestId(),
    input: {},
  });
  if (!result.ok) {
    const { code } = result.error;
    if (code === 'forbidden' || code === 'not-found' || code === 'invalid-input') return null;
    throw new Error(`access.mine: ${code}`);
  }
  const { standing } = result.value;
  switch (standing.kind) {
    case 'member':
    case 'open':
      return standing;
    case 'pending':
      return { kind: 'pending', sent: day(standing.createdAt), reason: standing.reason };
    case 'cooldown':
      return { kind: 'cooldown', decided: day(standing.decidedAt), from: day(standing.until) };
    case 'blocked':
      return { kind: 'blocked' };
  }
}

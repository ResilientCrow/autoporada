import { day } from './dates';
import { myStanding } from './my-access';
import { getViewer } from './viewer';

/** What „Žádost o přístup“ shows, its dates already written out. */
type AccessPageModel =
  | { readonly kind: 'member' }
  | { readonly kind: 'open'; readonly previous: 'rejected' | 'cancelled' | null }
  | {
      readonly kind: 'pending';
      readonly requestId: string;
      readonly version: number;
      readonly sent: string;
      readonly reason: string;
    }
  | { readonly kind: 'cooldown'; readonly decided: string; readonly from: string }
  | { readonly kind: 'blocked' };

/** The access page's model, or null for a visitor or a refusal (the page answers 404). */
export async function accessPage(): Promise<AccessPageModel | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  const standing = await myStanding(viewer);
  if (standing === null) return null;
  switch (standing.kind) {
    case 'member':
    case 'open':
      return standing;
    case 'pending':
      return {
        kind: 'pending',
        requestId: standing.requestId,
        version: standing.version,
        sent: day(standing.createdAt),
        reason: standing.reason,
      };
    case 'cooldown':
      return { kind: 'cooldown', decided: day(standing.decidedAt), from: day(standing.until) };
    case 'blocked':
      return { kind: 'blocked' };
  }
}

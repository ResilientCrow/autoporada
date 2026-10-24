import { myStanding } from './my-access';
import { getViewer } from './viewer';

/** What the home page needs beyond the viewer: a waiting user's standing on asking for access. */
type HomePageModel =
  | { readonly kind: 'member' }
  | { readonly kind: 'pending'; readonly standing: 'open' | 'pending' | 'cooldown' | 'blocked' };

/** The home page's model, or null for a visitor or a refusal. Only a pending user costs a lookup. */
export async function homePage(): Promise<HomePageModel | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  if (viewer.actor.role !== 'pending') return { kind: 'member' };
  const standing = await myStanding(viewer);
  if (standing === null) return null;
  // A pending role is never a member; the use case says so for anyone else.
  return { kind: 'pending', standing: standing.kind === 'member' ? 'open' : standing.kind };
}

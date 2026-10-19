import { homePage, requireViewer } from '@/server/pages';
import { cs } from '@/ui/copy';

/** The home page; the dashboard of M5 replaces it. */
export default async function HomePage() {
  const home = await homePage(await requireViewer('/'));
  return (
    <main>
      <h1>{cs.app.name}</h1>
      <p>
        {cs.home.signedInAs} {home.displayName}
      </p>
      {home.pending && <p role="status">{cs.home.pending}</p>}
      <form method="post" action="/auth/logout">
        <button type="submit" name="scope" value="this">
          {cs.home.signOut}
        </button>{' '}
        <button type="submit" name="scope" value="all">
          {cs.home.signOutEverywhere}
        </button>
      </form>
    </main>
  );
}

import { signInPage } from '@/server/pages';
import { cs } from '@/ui/copy';

type Props = { readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

/** The sign-in page; M5 gives it the school's look. Links, never prefetched: each start stores a sign-in. */
export default async function SignInPage({ searchParams }: Props) {
  const page = signInPage(await searchParams);
  return (
    <main>
      <h1>{cs.signIn.title}</h1>
      {page.loggedOut && (
        <p role="status">
          {page.loggedOut === 'everywhere'
            ? cs.signIn.loggedOut.everywhere
            : cs.signIn.loggedOut.here}{' '}
          {cs.signIn.loggedOut.sharedComputer}
        </p>
      )}
      {page.error && (
        <p role="alert">
          {cs.signIn.errors[page.error]}
          {page.code && (
            <>
              {' '}
              {cs.signIn.code} <code>{page.code}</code>
            </>
          )}
        </p>
      )}
      <p>{cs.signIn.intro}</p>
      <p>
        <a href={page.loginHref}>{cs.signIn.button}</a>
      </p>
      <p>
        <a href={page.switchHref}>{cs.signIn.switchAccount}</a>
      </p>
    </main>
  );
}

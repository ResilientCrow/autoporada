import type { FailureCause, SignInError } from '@/contracts';
import { cs } from '@/ui/copy';
import { ArrowLink, buttonStyles, Card, Notice, SlantLabel } from '@/ui/kit';

/** What failed, in words: a refusal names its AADSTS number, a failed sign-out its cause. */
function errorText(error: SignInError, aadsts: string | null, cause: FailureCause | null): string {
  if (error === 'idp-refused' && aadsts !== null) return cs.signIn.refusedWithCode(aadsts);
  if (error === 'signout-failed' && cause !== null) {
    return `${cs.signIn.errors['signout-failed']} ${cs.failures[cause]}`;
  }
  return cs.signIn.errors[error];
}

/**
 * The sign-in page. Art. 13 wants the privacy notice before the data is taken,
 * so its link comes before the button. Both sign-in links are plain anchors:
 * each GET of /auth/login stores a sign-in, so nothing may prefetch them. No
 * React Aria loads here.
 */
export function SignInPanel({
  error,
  aadsts,
  cause,
  technical,
  loggedOut,
  sharedComputerHint,
  loginHref,
  switchHref,
}: {
  readonly error: SignInError | null;
  /** A refusal's AADSTS number, already validated. */
  readonly aadsts: string | null;
  /** Why a sign-out was not recorded. */
  readonly cause: FailureCause | null;
  /** Development's technical line (ADR 0044). */
  readonly technical: string | null;
  readonly loggedOut: 'here' | 'everywhere' | null;
  readonly sharedComputerHint: boolean;
  readonly loginHref: string;
  readonly switchHref: string;
}) {
  const { signIn } = cs;
  const done =
    loggedOut === null ? null : (
      <Notice tone="info">
        {loggedOut === 'everywhere' ? signIn.loggedOut.everywhere : signIn.loggedOut.here}
      </Notice>
    );
  const problem =
    error === null ? null : (
      <Notice tone="problem">
        <p>{errorText(error, aadsts, cause)}</p>
        {technical === null ? null : (
          <p className="font-mono text-sm break-words">
            {cs.app.technical} {technical}
          </p>
        )}
      </Notice>
    );
  const hint = sharedComputerHint ? (
    <Notice tone="info" live={false}>
      {signIn.loggedOut.sharedComputer}
    </Notice>
  ) : null;
  return (
    <div className="flex flex-col gap-4">
      <SlantLabel level={1}>{signIn.title}</SlantLabel>
      {done}
      {problem}
      {hint}
      <Card>
        <div className="flex flex-col items-start gap-3">
          <p>{signIn.intro}</p>
          <p>{signIn.data}</p>
          <ArrowLink href="/ochrana-osobnich-udaju">{signIn.privacyLink}</ArrowLink>
          <p>{signIn.accounts}</p>
          <a href={loginHref} className={buttonStyles('primary')}>
            {signIn.button}
          </a>
          <p>{signIn.redirect}</p>
          <a href={switchHref}>{signIn.switchAccount}</a>
        </div>
      </Card>
    </div>
  );
}

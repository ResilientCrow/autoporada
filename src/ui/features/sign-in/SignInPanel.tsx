import type { SignInError } from '@/contracts';
import { cs } from '@/ui/copy';
import { ArrowLink, buttonStyles, Card, Notice, SlantLabel } from '@/ui/kit';

/**
 * The sign-in page. Art. 13 wants the privacy notice before the data is taken,
 * so its link comes before the button. Both sign-in links are plain anchors:
 * each GET of /auth/login stores a sign-in, so nothing may prefetch them. No
 * React Aria loads here.
 */
export function SignInPanel({
  error,
  code,
  loggedOut,
  sharedComputerHint,
  loginHref,
  switchHref,
}: {
  readonly error: SignInError | null;
  readonly code: string | null;
  readonly loggedOut: 'here' | 'everywhere' | null;
  readonly sharedComputerHint: boolean;
  readonly loginHref: string;
  readonly switchHref: string;
}) {
  const { signIn } = cs;
  const lead = ` ${cs.app.errorCode} `;
  const codeLine =
    code === null ? null : (
      <>
        {lead}
        <code>{code}</code>
      </>
    );
  const done =
    loggedOut === null ? null : (
      <Notice tone="info">
        {loggedOut === 'everywhere' ? signIn.loggedOut.everywhere : signIn.loggedOut.here}
      </Notice>
    );
  const problem =
    error === null ? null : (
      <Notice tone="problem">
        {signIn.errors[error]}
        {codeLine}
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

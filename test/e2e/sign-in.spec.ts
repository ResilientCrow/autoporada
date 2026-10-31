/**
 * The sign-in journey against mock-oauth2-server (compose.dev.yaml), whose
 * login page offers the personas of docker/dev/mock-oauth2.json.
 */
import { cs } from '@/ui/copy';

import { expect, openNav, test } from './fixtures';

test('a member signs in, waits for approval, and signs out', async ({
  page,
  context,
  expectAccessible,
  signInAs,
}) => {
  await signInAs(/^Učitelka/);
  await expect(page).toHaveURL(/:\d+\/$/);
  // Present at load, so not a live region (nothing is announced as a change).
  await expect(page.getByRole('main').getByText(cs.home.pending)).toBeVisible();
  await expect(page.getByRole('main').getByRole('status')).toHaveCount(0);
  await expectAccessible();
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === '__Host-ap_session')).toMatchObject({
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
    expires: -1,
  });
  expect(cookies.find((c) => c.name === '__Host-ap_signin')).toBeUndefined();

  await openNav(page);
  await page.getByRole('button', { name: cs.shell.signOut, exact: true }).click();
  await expect(page).toHaveURL(/\/prihlaseni\?odhlaseno=1$/);
  await expect(page.getByRole('main').getByRole('status')).toContainText(cs.signIn.loggedOut.here);
  expect((await context.cookies()).map((c) => c.name)).not.toContain('__Host-ap_session');
  await page.goto('/');
  await expect(page).toHaveURL(/\/prihlaseni\?returnTo=%2F$/);
});

test('a guest is turned away and gets no session', async ({ page, context, signInAs }) => {
  await signInAs(/^Host/);
  await expect(page).toHaveURL(/\/prihlaseni\?chyba=not-member$/);
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    cs.signIn.errors['not-member'],
  );
  expect((await context.cookies()).map((c) => c.name)).toEqual([]);
});

/**
 * The sign-in journey on the Arch UI against mock-oauth2-server (compose.dev.yaml), whose login
 * page offers the personas of docker/dev/mock-oauth2.json. What arch.spec.ts covers (a refused
 * sign-in's message, the account choice after a sign-out, a mail link, sign-out everywhere) is not
 * repeated here.
 */
import { cs } from '@/ui/copy';

import { expect, test } from './fixtures';

test('a member signs in, waits for approval, and signs out', async ({
  page,
  context,
  signInAs,
}) => {
  await signInAs(/^Učitelka/);
  await expect(page).toHaveURL(/:\d+\/$/);
  // A new member has no access yet: Arch asks for the reason, not for a page of the school's.
  await expect(
    page.getByRole('heading', { level: 1, name: 'Zatím tu nemáte přístup' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Odeslat žádost' })).toBeVisible();
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === '__Host-ap_session')).toMatchObject({
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
    expires: -1,
  });
  expect(cookies.find((c) => c.name === '__Host-ap_signin')).toBeUndefined();

  await page.getByRole('button', { name: 'Zpět na přihlášení' }).click();
  // Signing out returns to the Arch sign-in, which says so.
  await expect(page).toHaveURL(/:\d+\/\?odhlaseno=1$/);
  await expect(page.getByRole('link', { name: cs.signIn.button })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText(cs.signIn.loggedOut.here);
  expect((await context.cookies()).map((c) => c.name)).not.toContain('__Host-ap_session');

  // The session is gone for good: the address alone shows the sign-in again.
  await page.goto('/');
  await expect(page.getByRole('link', { name: cs.signIn.button })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Porada vedení školy' })).toBeVisible();
  const state = await page.request.get('/api/arch/state', { maxRedirects: 0 });
  expect(state.status()).toBe(303);
  expect(new URL(state.headers()['location'] ?? '', page.url()).pathname).toBe('/');
});

test('a guest is turned away and gets no session', async ({ page, context, signInAs }) => {
  await signInAs(/^Host/);
  await expect(page).toHaveURL(/\/\?chyba=not-member$/);
  await expect(page.getByRole('alert')).toHaveText(cs.signIn.errors['not-member']);
  expect((await context.cookies()).map((c) => c.name)).toEqual([]);
});

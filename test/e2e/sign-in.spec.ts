/**
 * The sign-in journey against mock-oauth2-server (compose.dev.yaml), whose
 * login page offers the personas of docker/dev/mock-oauth2.json.
 */
import type { Page } from '@playwright/test';

import { cs } from '@/ui/copy';

import { expect, test } from './fixtures';

async function signInAs(page: Page, persona: RegExp) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/prihlaseni\?returnTo=%2F$/);
  await page.getByRole('link', { name: cs.signIn.button }).click();
  await expect(page.getByRole('heading', { name: 'Vývojové přihlášení' })).toBeVisible();
  await page.getByRole('button', { name: persona }).click();
}

test('a member signs in, waits for approval, and signs out', async ({
  page,
  context,
  expectAccessible,
}) => {
  await signInAs(page, /^Učitelka/);
  await expect(page).toHaveURL(/:\d+\/$/);
  await expect(page.getByRole('main').getByRole('status')).toHaveText(cs.home.pending);
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

  await page.getByRole('button', { name: cs.home.signOut, exact: true }).click();
  await expect(page).toHaveURL(/\/prihlaseni\?odhlaseno=1$/);
  await expect(page.getByRole('main').getByRole('status')).toContainText(cs.signIn.loggedOut.here);
  expect((await context.cookies()).map((c) => c.name)).not.toContain('__Host-ap_session');
  await page.goto('/');
  await expect(page).toHaveURL(/\/prihlaseni\?returnTo=%2F$/);
});

test('a guest is turned away and gets no session', async ({ page, context }) => {
  await signInAs(page, /^Host/);
  await expect(page).toHaveURL(/\/prihlaseni\?chyba=not-member$/);
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    cs.signIn.errors['not-member'],
  );
  expect((await context.cookies()).map((c) => c.name)).toEqual([]);
});

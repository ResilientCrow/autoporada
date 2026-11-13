import { cs } from '@/ui/copy';

import { expect, test } from './fixtures';

// Branch arch-ui: `/` is the Arch UI, which signs in on its own page; the classic home is `/klasicke`.
test('the Arch home shows an anonymous visitor its sign-in, in Czech', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
  await expect(page.getByRole('link', { name: cs.signIn.button })).toBeVisible();
});

test('the classic home sends an anonymous visitor to the sign-in page, in Czech', async ({
  page,
  expectAccessible,
}) => {
  await page.goto('/klasicke');
  await expect(page).toHaveURL(/\/prihlaseni\?returnTo=%2Fklasicke$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(cs.signIn.title);
  await expect(page.getByRole('link', { name: cs.signIn.button })).toHaveAttribute(
    'href',
    '/auth/login?returnTo=%2Fklasicke',
  );
  await expectAccessible();
});

test('the sign-in screen names only known errors, never a code beyond an AADSTS number', async ({
  page,
  expectAccessible,
}) => {
  const alert = page.getByRole('alert');
  await page.goto('/?chyba=idp-refused&aadsts=AADSTS50011&kod=abcdef12-3456');
  await expect(alert).toContainText(cs.signIn.refusedWithCode('AADSTS50011'));
  await expect(alert).not.toContainText('abcdef12-3456');
  await expectAccessible();
  await page.goto('/?chyba=idp-refused&aadsts=%3Cb%3Ex%3C%2Fb%3E');
  await expect(alert).toContainText(cs.signIn.errors['idp-refused']);
  await expect(alert).not.toContainText('<b>');
  await page.goto('/?chyba=database-down');
  await expect(alert).toContainText(cs.signIn.errors['database-down']);
  await page.goto('/?chyba=failed');
  await expect(page.getByRole('link', { name: cs.signIn.button })).toBeVisible();
  await expect(alert).toHaveCount(0);
  await page.goto('/?chyba=%3Cscript%3E&kod=%3Cb%3E');
  await expect(page.getByRole('link', { name: cs.signIn.button })).toBeVisible();
  await expect(alert).toHaveCount(0);
});

test('the signed-out notice screen passes axe', async ({ page, expectAccessible }) => {
  await page.goto('/?odhlaseno=1');
  await expect(page.getByRole('status')).toHaveText(cs.signIn.loggedOut.here);
  await expectAccessible();
});

test('the Arch home renders per request and is never cached (ADR 0001)', async ({ request }) => {
  const response = await request.get('/');
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(response.headers()['x-nextjs-prerender']).toBeUndefined();
});

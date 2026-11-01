import { cs } from '@/ui/copy';

import { expect, test } from './fixtures';

test('the home page sends an anonymous visitor to the sign-in page, in Czech', async ({
  page,
  expectAccessible,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/prihlaseni\?returnTo=%2F$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(cs.signIn.title);
  await expect(page.getByRole('link', { name: cs.signIn.button })).toHaveAttribute(
    'href',
    '/auth/login?returnTo=%2F',
  );
  await expectAccessible();
});

test('the sign-in page names only known errors, never a code beyond an AADSTS number', async ({
  page,
  expectAccessible,
}) => {
  const alert = page.getByRole('main').getByRole('alert');
  await page.goto('/prihlaseni?chyba=idp-refused&aadsts=AADSTS50011&kod=abcdef12-3456');
  await expect(alert).toContainText(cs.signIn.refusedWithCode('AADSTS50011'));
  await expect(alert).not.toContainText('abcdef12-3456');
  await expectAccessible();
  await page.goto('/prihlaseni?chyba=idp-refused&aadsts=%3Cb%3Ex%3C%2Fb%3E');
  await expect(alert).toContainText(cs.signIn.errors['idp-refused']);
  await expect(alert).not.toContainText('<b>');
  await page.goto('/prihlaseni?chyba=database-down');
  await expect(alert).toContainText(cs.signIn.errors['database-down']);
  await page.goto('/prihlaseni?chyba=failed');
  await expect(alert).toHaveCount(0);
  await page.goto('/prihlaseni?chyba=%3Cscript%3E&kod=%3Cb%3E');
  await expect(alert).toHaveCount(0);
});

test('the signed-out notice page passes axe', async ({ page, expectAccessible }) => {
  await page.goto('/prihlaseni?odhlaseno=1');
  await expectAccessible();
});

for (const path of ['/prihlaseni', '/ochrana-osobnich-udaju']) {
  test(`${path} renders per request and is never cached (ADR 0001)`, async ({ request }) => {
    const response = await request.get(path);
    expect(response.headers()['cache-control']).toContain('no-store');
    expect(response.headers()['x-nextjs-prerender']).toBeUndefined();
  });
}

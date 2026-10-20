import { expect, test } from './fixtures';

test('the home page sends an anonymous visitor to the sign-in page, in Czech', async ({
  page,
  expectAccessible,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/prihlaseni\?returnTo=%2F$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Přihlášení');
  await expect(
    page.getByRole('link', { name: 'Přihlásit se účtem Microsoft 365' }),
  ).toHaveAttribute('href', '/auth/login?returnTo=%2F');
  await expectAccessible();
});

test('the sign-in page names only known errors, with the code to report', async ({
  page,
  expectAccessible,
}) => {
  await page.goto('/prihlaseni?chyba=failed&kod=abcdef12-3456');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Přihlášení se nepodařilo.',
  );
  await expect(page.getByRole('main').getByRole('alert')).toContainText('abcdef12-3456');
  await expectAccessible();
  await page.goto('/prihlaseni?chyba=%3Cscript%3E&kod=%3Cb%3E');
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
});

test('the signed-out notice page passes axe', async ({ page, expectAccessible }) => {
  await page.goto('/prihlaseni?odhlaseno=1');
  await expectAccessible();
});

test('pages render per request and are never cached (ADR 0001)', async ({ request }) => {
  const response = await request.get('/prihlaseni');
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(response.headers()['x-nextjs-prerender']).toBeUndefined();
});

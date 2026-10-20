/** One test per screen; each screen joins in the commit that restyles it. */
import { cs } from '@/ui/copy';

import { expect, test } from './fixtures';

const TITLE_SUFFIX = / – Autoporada$/;

const SCREENS = [
  ['the 404 page', '/tato-stranka-neexistuje', 404, null],
  ['the gallery', '/vzornik', 200, null],
  ['the home page of a waiting teacher', '/', 200, /^Učitelka/],
  ['the sign-in page', '/prihlaseni', 200, null],
  ['the sign-in page with an error', '/prihlaseni?chyba=failed&kod=abcdef12-3456', 200, null],
  ['the sign-in page after signing out', '/prihlaseni?odhlaseno=1', 200, null],
  ['the privacy notice for a visitor', '/ochrana-osobnich-udaju', 200, null],
  ['the privacy notice for a signed-in teacher', '/ochrana-osobnich-udaju', 200, /^Učitelka/],
] as const;

for (const [name, url, status, persona] of SCREENS) {
  test(`${name} is a well-formed, accessible, keyboard-friendly page`, async ({
    page,
    expectAccessible,
    expectSkipLink,
    expectFocusRings,
    expectNoReflow,
    signInAs,
  }) => {
    if (persona) await signInAs(persona);
    const response = await page.goto(url);
    expect(response?.status()).toBe(status);
    await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page).toHaveTitle(TITLE_SUFFIX);
    await expect.poll(() => page.evaluate(() => 'next' in window)).toBe(true);
    await expectAccessible();
    await expectNoReflow();
    // The live DOM may carry style attributes (Next's route announcer gets one through the CSSOM).
    expect(await (await page.request.get(url)).text()).not.toContain('style="');
    await expectSkipLink();
    await expectFocusRings();
  });
}

test('the error page answers 500 and passes axe', async ({ page, expectAccessible }) => {
  const response = await page.goto('/vzornik?stav=vyjimka');
  expect(response?.status()).toBe(500);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(cs.appError.title);
  await expect(page).toHaveTitle(TITLE_SUFFIX);
  await expect.poll(() => page.evaluate(() => 'next' in window)).toBe(true);
  await expectAccessible();
});

test('the sign-in page works without JavaScript and loads no React Aria', async ({
  browser,
  page,
}) => {
  const plain = await browser.newContext({ javaScriptEnabled: false });
  const bare = await plain.newPage();
  await bare.goto('/prihlaseni');
  await expect(bare.getByRole('heading', { level: 1 })).toHaveText(cs.signIn.title);
  await expect(bare.getByRole('link', { name: cs.signIn.button })).toBeVisible();
  await expect(bare.getByRole('link', { name: cs.signIn.switchAccount })).toBeVisible();
  await plain.close();

  await page.goto('/prihlaseni');
  await expect.poll(() => page.evaluate(() => 'next' in window)).toBe(true);
  await expect(page.locator('#react-aria-pressable-style')).toHaveCount(0);
});

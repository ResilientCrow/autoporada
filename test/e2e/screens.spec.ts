/** One test per screen; each screen joins in the commit that restyles it. */
import { cs } from '@/ui/copy';

import { expect, test } from './fixtures';

const TITLE_SUFFIX = / – Autoporada$/;

const SCREENS = [
  ['the 404 page', '/tato-stranka-neexistuje', 404],
  ['the gallery', '/vzornik', 200],
] as const;

for (const [name, url, status] of SCREENS) {
  test(`${name} is a well-formed, accessible, keyboard-friendly page`, async ({
    page,
    request,
    expectAccessible,
    expectSkipLink,
    expectFocusRings,
    expectNoReflow,
  }) => {
    const response = await page.goto(url);
    expect(response?.status()).toBe(status);
    await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page).toHaveTitle(TITLE_SUFFIX);
    await expect.poll(() => page.evaluate(() => 'next' in window)).toBe(true);
    await expectAccessible();
    await expectNoReflow();
    // The live DOM may carry style attributes (Next's route announcer gets one through the CSSOM).
    expect(await (await request.get(url)).text()).not.toContain('style="');
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

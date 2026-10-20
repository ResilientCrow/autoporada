/** One test per screen; each screen joins in the commit that restyles it. */
import { cs } from '@/ui/copy';

import { expect, test } from './fixtures';

test('the error page answers 500 and passes axe', async ({ page, expectAccessible }) => {
  const response = await page.goto('/vzornik?stav=vyjimka');
  expect(response?.status()).toBe(500);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(cs.appError.title);
  await expect.poll(() => page.evaluate(() => 'next' in window)).toBe(true);
  await expectAccessible();
});

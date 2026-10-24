import { cs } from '@/ui/copy';

import { expect, test } from './fixtures';

test('after „Zkusit znovu“ the page still styles its pressables under the CSP', async ({
  page,
  context,
  baseURL,
  hydrated,
}) => {
  await context.addCookies([{ name: 'vzornik_vyjimka', value: '1', url: baseURL ?? '' }]);
  await page.goto('/vzornik');
  const retry = page.getByRole('button', { name: cs.appError.retry });
  await expect(retry).toBeVisible();
  await hydrated();

  await context.clearCookies({ name: 'vzornik_vyjimka' });
  await retry.click();

  const button = page.getByRole('button', { name: cs.gallery.buttons.primary });
  await expect(button).toBeVisible();
  await button.click();
  const name = page.locator('form#demo-live input[name="name"]');
  await name.fill('Jana');
  await expect(name).toHaveValue('Jana');
  // React Aria's <style> was applied: it needed this document's nonce.
  expect(await button.evaluate((b) => getComputedStyle(b).touchAction)).toBe('manipulation');
});

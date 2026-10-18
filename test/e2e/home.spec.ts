import { expect, test } from '@playwright/test';

test('home page renders in Czech', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Autoporada');
});
